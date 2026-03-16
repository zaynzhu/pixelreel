package com.pixelreel.entity;

import com.pixelreel.enums.RecordStatus;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("game")
public class Game {
  @TableId(value = "id", type = IdType.AUTO)
  private Long id;

  @TableField("rawg_id")
  private Long rawgId;

  @TableField("steam_app_id")
  private Long steamAppId;

  @TableField("xbox_id")
  private String xboxId;

  @TableField("psn_id")
  private String psnId;

  @TableField("platform")
  private String platform;

  @NotBlank
  @TableField("title")
  private String title;

  @TableField("poster_url")
  private String posterUrl;

  @TableField("playtime_minutes")
  private Integer playtimeMinutes;

  @TableField("achievement_total")
  private Integer achievementTotal;

  @TableField("achievement_unlocked")
  private Integer achievementUnlocked;

  @TableField("imported_at")
  private LocalDateTime importedAt;

  @NotNull
  @TableField("status")
  private RecordStatus status;

  @Min(0)
  @Max(10)
  @TableField("rating")
  private Integer rating;

  @Size(max = 1000)
  @TableField("short_review")
  private String shortReview;

  @TableField("created_at")
  private LocalDateTime createdAt;

  @TableField("updated_at")
  private LocalDateTime updatedAt;
}


