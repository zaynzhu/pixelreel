package com.pixelreel.service;

import com.pixelreel.dto.library.LibraryRecordResponse;
import com.pixelreel.dto.library.LibraryRecordUpdateRequest;
import com.pixelreel.entity.Game;
import com.pixelreel.entity.Movie;
import com.pixelreel.enums.RecordStatus;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class LibraryService {
  private final MovieService movieService;
  private final GameService gameService;

  public List<LibraryRecordResponse> listRecords() {
    List<LibraryRecordResponse> records = new ArrayList<>();
    movieService.list().stream().map(this::toMovieRecord).forEach(records::add);
    gameService.list().stream().map(this::toGameRecord).forEach(records::add);
    records.sort(
        Comparator.comparing(LibraryRecordResponse::updatedAt, Comparator.nullsLast(LocalDateTime::compareTo))
            .thenComparing(LibraryRecordResponse::createdAt, Comparator.nullsLast(LocalDateTime::compareTo))
            .reversed()
    );
    return records;
  }

  public LibraryRecordResponse updateRecord(String category, Long id, LibraryRecordUpdateRequest request) {
    return switch (normalizeCategory(category)) {
      case "movie" -> updateMovie(id, request);
      case "game" -> updateGame(id, request);
      default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown category: " + category);
    };
  }

  private LibraryRecordResponse updateMovie(Long id, LibraryRecordUpdateRequest request) {
    Movie movie = movieService.getById(id);
    if (movie == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Movie record not found");
    }
    applyUpdate(movie, request);
    movieService.updateById(movie);
    return toMovieRecord(movieService.getById(id));
  }

  private LibraryRecordResponse updateGame(Long id, LibraryRecordUpdateRequest request) {
    Game game = gameService.getById(id);
    if (game == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Game record not found");
    }
    applyUpdate(game, request);
    gameService.updateById(game);
    return toGameRecord(gameService.getById(id));
  }

  private void applyUpdate(Movie movie, LibraryRecordUpdateRequest request) {
    movie.setStatus(request.status());
    movie.setRating(request.rating());
    movie.setShortReview(normalizeReview(request.shortReview()));
  }

  private void applyUpdate(Game game, LibraryRecordUpdateRequest request) {
    game.setStatus(request.status());
    game.setRating(request.rating());
    game.setShortReview(normalizeReview(request.shortReview()));
  }

  private LibraryRecordResponse toMovieRecord(Movie movie) {
    String sourceKey = detectMovieSource(movie);
    return new LibraryRecordResponse(
        movie.getId(),
        "movie",
        movie.getTitle(),
        movie.getPosterUrl(),
        sourceKey,
        movieSourceLabel(sourceKey),
        null,
        safeStatus(movie.getStatus()).getCode(),
        movie.getRating(),
        movie.getShortReview(),
        null,
        null,
        null,
        movie.getCreatedAt(),
        movie.getUpdatedAt(),
        null
    );
  }

  private LibraryRecordResponse toGameRecord(Game game) {
    String sourceKey = detectGameSource(game);
    return new LibraryRecordResponse(
        game.getId(),
        "game",
        game.getTitle(),
        game.getPosterUrl(),
        sourceKey,
        gameSourceLabel(sourceKey),
        StringUtils.hasText(game.getPlatform()) ? game.getPlatform() : gameSourceLabel(sourceKey),
        safeStatus(game.getStatus()).getCode(),
        game.getRating(),
        game.getShortReview(),
        game.getPlaytimeMinutes(),
        game.getAchievementTotal(),
        game.getAchievementUnlocked(),
        game.getCreatedAt(),
        game.getUpdatedAt(),
        game.getImportedAt()
    );
  }

  private String detectMovieSource(Movie movie) {
    if (movie.getDoubanId() != null) {
      return "douban";
    }
    if (movie.getTmdbId() != null) {
      return "tmdb";
    }
    if (StringUtils.hasText(movie.getImdbId())) {
      return "imdb";
    }
    if (StringUtils.hasText(movie.getTraktId())) {
      return "trakt";
    }
    return "manual";
  }

  private String detectGameSource(Game game) {
    if (StringUtils.hasText(game.getPsnId())) {
      return "psn";
    }
    if (StringUtils.hasText(game.getXboxId())) {
      return "xbox";
    }
    if (game.getSteamAppId() != null) {
      return "steam";
    }
    if (game.getRawgId() != null) {
      return "rawg";
    }
    return "manual";
  }

  private String movieSourceLabel(String sourceKey) {
    return switch (sourceKey) {
      case "douban" -> "豆瓣";
      case "tmdb" -> "TMDB";
      case "imdb" -> "IMDb";
      case "trakt" -> "Trakt";
      default -> "Manual";
    };
  }

  private String gameSourceLabel(String sourceKey) {
    return switch (sourceKey) {
      case "psn" -> "PSN";
      case "xbox" -> "Xbox";
      case "steam" -> "Steam";
      case "rawg" -> "RAWG";
      default -> "Manual";
    };
  }

  private String normalizeCategory(String category) {
    if (!StringUtils.hasText(category)) {
      return "";
    }
    return category.trim().toLowerCase();
  }

  private String normalizeReview(String shortReview) {
    if (!StringUtils.hasText(shortReview)) {
      return null;
    }
    return shortReview.trim();
  }

  private RecordStatus safeStatus(RecordStatus status) {
    return status == null ? RecordStatus.UNSET : status;
  }
}
