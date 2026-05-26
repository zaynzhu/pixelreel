package com.pixelreel.service.provider;

import com.pixelreel.config.SwitchProperties;
import com.pixelreel.dto.external.ExternalGameSearchResult;
import com.pixelreel.dto.external.ProviderSearchResult;
import com.pixelreel.service.search.GameSearchProvider;
import java.util.Collections;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class SwitchGameSearchProvider implements GameSearchProvider {
  private final SwitchProperties switchProperties;

  @Override
  public String id() {
    return "switch";
  }

  @Override
  public ProviderSearchResult<ExternalGameSearchResult> search(String query, int page) {
    ProviderSearchResult<ExternalGameSearchResult> result = new ProviderSearchResult<>();
    result.setProvider(id());

    result.setEnabled(false);
    result.setMessage("Switch 暂无公开 API，保留占位");
    result.setPage(page);
    result.setTotalPages(0);
    result.setTotalResults(0);
    result.setResults(Collections.emptyList());
    return result;
  }
}

