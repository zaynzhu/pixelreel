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
@TableName("movie")
public class Movie {
  @TableId(value = "id", type = IdType.AUTO)
  private Long id;

  @TableField("tmdb_id")
  private Long tmdbId;

  @TableField("imdb_id")
  private String imdbId;

  @TableField("douban_id")
  private String doubanId;

  @TableField("trakt_id")
  private String traktId;

  @NotBlank
  @TableField("title")
  private String title;

  @TableField("poster_url")
  private String posterUrl;

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


