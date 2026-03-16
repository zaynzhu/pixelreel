package com.pixelreel.service;

import com.pixelreel.dto.imports.ImportSummary;
import com.pixelreel.entity.Movie;
import com.pixelreel.enums.RecordStatus;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class DoubanCsvImportService {
  private final MovieService movieService;

  public ImportSummary importCsv(MultipartFile file, RecordStatus defaultStatus) {
    ImportSummary summary = new ImportSummary();
    summary.setErrors(new ArrayList<>());

    if (file == null || file.isEmpty()) {
      summary.getErrors().add("CSV 文件为空");
      return summary;
    }

    try (BufferedReader reader = new BufferedReader(
        new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8));
         CSVParser parser = CSVFormat.DEFAULT
             .builder()
             .setHeader()
             .setSkipHeaderRecord(true)
             .build()
             .parse(reader)) {

      List<String> headers = parser.getHeaderNames();
      Map<String, String> headerMap = buildHeaderMap(headers);

      String titleCol = pickHeader(headerMap, "title", "name", "电影", "片名", "标题", "条目", "作品");
      String doubanIdCol = pickHeader(headerMap, "douban", "豆瓣", "subject", "条目id", "subjectid", "subject_id");
      String imdbIdCol = pickHeader(headerMap, "imdb");
      String ratingCol = pickHeader(headerMap, "rating", "评分", "分数", "星级");
      String statusCol = pickHeader(headerMap, "status", "状态", "标记");
      String commentCol = pickHeader(headerMap, "comment", "短评", "评论", "备注", "感想");
      String linkCol = pickHeader(headerMap, "link", "url", "链接", "豆瓣链接");

      List<CSVRecord> records = parser.getRecords();
      List<Movie> toSave = new ArrayList<>();
      Map<String, Movie> existingByDouban = loadExistingByDouban(records, doubanIdCol, linkCol);
      Map<String, Movie> existingByImdb = loadExistingByImdb(records, imdbIdCol);

      for (CSVRecord record : records) {
        summary.setTotal(summary.getTotal() + 1);

        String title = getValue(record, titleCol);
        if (!StringUtils.hasText(title)) {
          summary.getErrors().add("第 " + record.getRecordNumber() + " 行缺少标题");
          summary.setSkipped(summary.getSkipped() + 1);
          continue;
        }

        String doubanId = extractDoubanId(getValue(record, doubanIdCol), getValue(record, linkCol));
        String imdbId = getValue(record, imdbIdCol);

        if (StringUtils.hasText(doubanId) && existingByDouban.containsKey(doubanId)) {
          summary.setSkipped(summary.getSkipped() + 1);
          continue;
        }
        if (StringUtils.hasText(imdbId) && existingByImdb.containsKey(imdbId)) {
          summary.setSkipped(summary.getSkipped() + 1);
          continue;
        }

        Movie movie = new Movie();
        movie.setTitle(title);
        movie.setDoubanId(doubanId);
        movie.setImdbId(imdbId);
        movie.setStatus(parseStatus(getValue(record, statusCol), defaultStatus));
        movie.setRating(parseRating(getValue(record, ratingCol)));
        movie.setShortReview(getValue(record, commentCol));
        toSave.add(movie);
      }

      if (!toSave.isEmpty()) {
        movieService.saveBatch(toSave);
        summary.setImported(toSave.size());
      }
      return summary;
    } catch (IOException ex) {
      summary.getErrors().add("读取 CSV 失败: " + ex.getMessage());
      return summary;
    }
  }

  private Map<String, String> buildHeaderMap(List<String> headers) {
    Map<String, String> map = new HashMap<>();
    for (String header : headers) {
      if (!StringUtils.hasText(header)) {
        continue;
      }
      map.put(normalize(header), header);
    }
    return map;
  }

  private String pickHeader(Map<String, String> headerMap, String... candidates) {
    for (String candidate : candidates) {
      String normalized = normalize(candidate);
      if (headerMap.containsKey(normalized)) {
        return headerMap.get(normalized);
      }
      for (Map.Entry<String, String> entry : headerMap.entrySet()) {
        if (entry.getKey().contains(normalized)) {
          return entry.getValue();
        }
      }
    }
    return null;
  }

  private String normalize(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
  }

  private String getValue(CSVRecord record, String header) {
    if (!StringUtils.hasText(header) || !record.isMapped(header)) {
      return null;
    }
    String value = record.get(header);
    return StringUtils.hasText(value) ? value.trim() : null;
  }

  private String extractDoubanId(String doubanIdValue, String linkValue) {
    if (StringUtils.hasText(doubanIdValue)) {
      return doubanIdValue;
    }
    if (!StringUtils.hasText(linkValue)) {
      return null;
    }
    String normalized = linkValue.trim();
    int idx = normalized.indexOf("/subject/");
    if (idx >= 0) {
      String tail = normalized.substring(idx + 9);
      int slash = tail.indexOf('/');
      return slash > 0 ? tail.substring(0, slash) : tail;
    }
    return null;
  }

  private RecordStatus parseStatus(String value, RecordStatus defaultStatus) {
    if (!StringUtils.hasText(value)) {
      return defaultStatus == null ? RecordStatus.WANT : defaultStatus;
    }
    String normalized = value.trim();
    if (normalized.contains("想") || normalized.equalsIgnoreCase("want")) {
      return RecordStatus.WANT;
    }
    if (normalized.contains("在") || normalized.equalsIgnoreCase("in_progress")) {
      return RecordStatus.IN_PROGRESS;
    }
    if (normalized.contains("看") || normalized.contains("已") || normalized.equalsIgnoreCase("done")) {
      return RecordStatus.DONE;
    }
    return defaultStatus == null ? RecordStatus.WANT : defaultStatus;
  }

  private Integer parseRating(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    try {
      double parsed = Double.parseDouble(value.trim());
      if (parsed <= 0) {
        return null;
      }
      if (parsed <= 5) {
        parsed = parsed * 2;
      }
      int rounded = (int) Math.round(parsed);
      if (rounded > 10) {
        return 10;
      }
      return rounded;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private Map<String, Movie> loadExistingByDouban(List<CSVRecord> records, String doubanIdCol, String linkCol) {
    if (!StringUtils.hasText(doubanIdCol) && !StringUtils.hasText(linkCol)) {
      return Collections.emptyMap();
    }
    List<String> ids = records.stream()
        .map(record -> extractDoubanId(getValue(record, doubanIdCol), getValue(record, linkCol)))
        .filter(StringUtils::hasText)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return movieService.lambdaQuery()
        .in(Movie::getDoubanId, ids)
        .list()
        .stream()
        .collect(Collectors.toMap(Movie::getDoubanId, Function.identity(), (a, b) -> a));
  }

  private Map<String, Movie> loadExistingByImdb(List<CSVRecord> records, String imdbIdCol) {
    if (!StringUtils.hasText(imdbIdCol)) {
      return Collections.emptyMap();
    }
    List<String> ids = records.stream()
        .map(record -> getValue(record, imdbIdCol))
        .filter(StringUtils::hasText)
        .distinct()
        .toList();
    if (ids.isEmpty()) {
      return Collections.emptyMap();
    }
    return movieService.lambdaQuery()
        .in(Movie::getImdbId, ids)
        .list()
        .stream()
        .collect(Collectors.toMap(Movie::getImdbId, Function.identity(), (a, b) -> a));
  }
}


