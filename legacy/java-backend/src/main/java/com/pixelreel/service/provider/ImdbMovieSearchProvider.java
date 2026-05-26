package com.pixelreel.service.provider;

import com.pixelreel.config.ImdbProperties;
import com.pixelreel.dto.external.ExternalMovieSearchResult;
import com.pixelreel.dto.external.ProviderSearchResult;
import com.pixelreel.service.search.MovieSearchProvider;
import java.util.Collections;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ImdbMovieSearchProvider implements MovieSearchProvider {
  private final ImdbProperties imdbProperties;

  @Override
  public String id() {
    return "imdb";
  }

  @Override
  public ProviderSearchResult<ExternalMovieSearchResult> search(String query, int page) {
    ProviderSearchResult<ExternalMovieSearchResult> result = new ProviderSearchResult<>();
    result.setProvider(id());

    if (!imdbProperties.enabled()) {
      result.setEnabled(false);
      result.setMessage("IMDb 直连未启用，建议使用 OMDb（provider=omdb）");
      result.setPage(page);
      result.setTotalPages(0);
      result.setTotalResults(0);
      result.setResults(Collections.emptyList());
      return result;
    }

    result.setEnabled(false);
    result.setMessage("IMDb API 需要 AWS Data Exchange 签名调用，当前未实现");
    result.setPage(page);
    result.setTotalPages(0);
    result.setTotalResults(0);
    result.setResults(Collections.emptyList());
    return result;
  }
}


