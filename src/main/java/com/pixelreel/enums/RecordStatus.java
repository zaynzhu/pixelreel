package com.pixelreel.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum RecordStatus {
  UNSET("UNSET"),
  WANT("WANT"),
  IN_PROGRESS("IN_PROGRESS"),
  DONE("DONE");

  @EnumValue
  @JsonValue
  private final String code;

  @JsonCreator
  public static RecordStatus fromCode(String code) {
    for (RecordStatus status : RecordStatus.values()) {
      if (status.code.equalsIgnoreCase(code)) {
        return status;
      }
    }
    throw new IllegalArgumentException("Unknown status: " + code);
  }
}

