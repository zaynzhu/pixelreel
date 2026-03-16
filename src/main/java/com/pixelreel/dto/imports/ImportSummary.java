package com.pixelreel.dto.imports;

import java.util.List;
import lombok.Data;

@Data
public class ImportSummary {
  private int total;
  private int imported;
  private int skipped;
  private List<String> errors;
}

