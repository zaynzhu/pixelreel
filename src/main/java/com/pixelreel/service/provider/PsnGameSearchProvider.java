package com.pixelreel.service.provider;

import com.pixelreel.config.PsnProperties;
import com.pixelreel.config.PspricesProperties;
import com.pixelreel.dto.external.ExternalGameSearchResult;
import com.pixelreel.dto.external.ProviderSearchResult;
import com.pixelreel.service.search.GameSearchProvider;
import java.util.Collections;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PsnGameSearchProvider implements GameSearchProvider {
  private final PsnProperties psnProperties;
  private final PspricesProperties pspricesProperties;

  @Override
  public String id() {
    return "psn";
  }

  @Override
  public ProviderSearchResult<ExternalGameSearchResult> search(String query, int page) {
    ProviderSearchResult<ExternalGameSearchResult> result = new ProviderSearchResult<>();
    result.setProvider(id());

    if (!psnProperties.enabled()) {
      result.setEnabled(false);
      result.setMessage("PSN 未启用，需要确定可用的官方或第三方搜索 API");
      result.setPage(page);
      result.setTotalPages(0);
      result.setTotalResults(0);
      result.setResults(Collections.emptyList());
      return result;
    }

    if (pspricesProperties.enabled()) {
      result.setEnabled(false);
      result.setMessage("已配置 PSprices，但缺少可用的搜索参数或目录同步策略");
    } else {
      result.setEnabled(false);
      result.setMessage("PSN 搜索 API 尚未配置");
    }
    result.setPage(page);
    result.setTotalPages(0);
    result.setTotalResults(0);
    result.setResults(Collections.emptyList());
    return result;
  }
}


