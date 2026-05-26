package com.pixelreel.service;

import com.pixelreel.dto.profile.ProfileSummaryResponse;
import com.pixelreel.entity.Game;
import com.pixelreel.entity.Movie;
import com.pixelreel.enums.RecordStatus;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class ProfileSummaryService {
  private static final int RECENT_LIMIT = 8;

  private final MovieService movieService;
  private final GameService gameService;

  public ProfileSummaryResponse getSummary() {
    List<Movie> movies = movieService.lambdaQuery()
        .orderByDesc(Movie::getCreatedAt)
        .list();
    List<Game> games = gameService.lambdaQuery()
        .orderByDesc(Game::getCreatedAt)
        .list();

    return new ProfileSummaryResponse(
        buildOverview(movies, games),
        buildRatings(movies, games),
        buildMovieStatusCounts(movies),
        buildGameStatusCounts(games),
        buildMovieSourceCounts(movies),
        buildGamePlatformCounts(games),
        buildRecentItems(movies, games)
    );
  }

  private ProfileSummaryResponse.Overview buildOverview(List<Movie> movies, List<Game> games) {
    int totalMovies = movies.size();
    int totalGames = games.size();
    int completedMovies = countMoviesByStatus(movies, RecordStatus.DONE);
    int completedGames = countGamesByStatus(games, RecordStatus.DONE);
    int ratedRecords = (int) movies.stream().filter(movie -> movie.getRating() != null).count()
        + (int) games.stream().filter(game -> game.getRating() != null).count();
    int reviewedRecords = (int) movies.stream().filter(movie -> StringUtils.hasText(movie.getShortReview())).count()
        + (int) games.stream().filter(game -> StringUtils.hasText(game.getShortReview())).count();
    int importedGames = (int) games.stream().filter(game -> game.getImportedAt() != null).count();

    return new ProfileSummaryResponse.Overview(
        totalMovies + totalGames,
        totalMovies,
        totalGames,
        completedMovies,
        completedGames,
        ratedRecords,
        reviewedRecords,
        importedGames
    );
  }

  private ProfileSummaryResponse.RatingSummary buildRatings(List<Movie> movies, List<Game> games) {
    Double movieAverage = roundOneDecimal(movies.stream()
        .map(Movie::getRating)
        .filter(Objects::nonNull)
        .mapToInt(Integer::intValue)
        .average()
        .orElse(Double.NaN));
    Double gameAverage = roundOneDecimal(games.stream()
        .map(Game::getRating)
        .filter(Objects::nonNull)
        .mapToInt(Integer::intValue)
        .average()
        .orElse(Double.NaN));

    List<Integer> allRatings = new ArrayList<>();
    movies.stream().map(Movie::getRating).filter(Objects::nonNull).forEach(allRatings::add);
    games.stream().map(Game::getRating).filter(Objects::nonNull).forEach(allRatings::add);

    Double overallAverage = roundOneDecimal(allRatings.stream()
        .mapToInt(Integer::intValue)
        .average()
        .orElse(Double.NaN));

    return new ProfileSummaryResponse.RatingSummary(overallAverage, movieAverage, gameAverage);
  }

  private List<ProfileSummaryResponse.CountItem> buildMovieStatusCounts(List<Movie> movies) {
    List<ProfileSummaryResponse.CountItem> items = new ArrayList<>();
    for (RecordStatus status : RecordStatus.values()) {
      items.add(new ProfileSummaryResponse.CountItem(
          status.getCode(),
          statusLabel(status),
          countMoviesByStatus(movies, status)
      ));
    }
    return items;
  }

  private List<ProfileSummaryResponse.CountItem> buildGameStatusCounts(List<Game> games) {
    List<ProfileSummaryResponse.CountItem> items = new ArrayList<>();
    for (RecordStatus status : RecordStatus.values()) {
      items.add(new ProfileSummaryResponse.CountItem(
          status.getCode(),
          statusLabel(status),
          countGamesByStatus(games, status)
      ));
    }
    return items;
  }

  private List<ProfileSummaryResponse.CountItem> buildMovieSourceCounts(List<Movie> movies) {
    return List.of(
        countItem("TMDB", "TMDB", (int) movies.stream().filter(movie -> "TMDB".equals(inferMovieSource(movie))).count()),
        countItem("DOUBAN", "豆瓣", (int) movies.stream().filter(movie -> "DOUBAN".equals(inferMovieSource(movie))).count()),
        countItem("IMDB", "IMDb", (int) movies.stream().filter(movie -> "IMDB".equals(inferMovieSource(movie))).count()),
        countItem("TRAKT", "Trakt", (int) movies.stream().filter(movie -> "TRAKT".equals(inferMovieSource(movie))).count()),
        countItem("MANUAL", "手动", (int) movies.stream().filter(movie -> "MANUAL".equals(inferMovieSource(movie))).count())
    );
  }

  private List<ProfileSummaryResponse.CountItem> buildGamePlatformCounts(List<Game> games) {
    List<String> orderedPlatforms = List.of("RAWG", "STEAM", "XBOX", "PSN", "MANUAL");
    List<ProfileSummaryResponse.CountItem> items = new ArrayList<>();
    for (String platform : orderedPlatforms) {
      int count = (int) games.stream()
          .filter(game -> platform.equals(inferGamePlatform(game)))
          .count();
      items.add(countItem(platform, platformLabel(platform), count));
    }
    return items;
  }

  private List<ProfileSummaryResponse.RecentRecordItem> buildRecentItems(List<Movie> movies, List<Game> games) {
    List<RecentSnapshot> snapshots = new ArrayList<>();

    for (Movie movie : movies) {
      snapshots.add(new RecentSnapshot(
          "movie",
          movie.getId(),
          movie.getTitle(),
          sourceLabel(inferMovieSource(movie)),
          movie.getPosterUrl(),
          movie.getStatus() == null ? RecordStatus.UNSET.getCode() : movie.getStatus().getCode(),
          movie.getRating(),
          movie.getCreatedAt()
      ));
    }

    for (Game game : games) {
      snapshots.add(new RecentSnapshot(
          "game",
          game.getId(),
          game.getTitle(),
          platformLabel(inferGamePlatform(game)),
          game.getPosterUrl(),
          game.getStatus() == null ? RecordStatus.UNSET.getCode() : game.getStatus().getCode(),
          game.getRating(),
          game.getCreatedAt()
      ));
    }

    return snapshots.stream()
        .sorted(Comparator.comparing(RecentSnapshot::createdAt, Comparator.nullsLast(Comparator.reverseOrder())))
        .limit(RECENT_LIMIT)
        .map(snapshot -> new ProfileSummaryResponse.RecentRecordItem(
            snapshot.category(),
            snapshot.id(),
            snapshot.title(),
            snapshot.subtitle(),
            snapshot.posterUrl(),
            snapshot.status(),
            snapshot.rating(),
            snapshot.createdAt()
        ))
        .toList();
  }

  private int countMoviesByStatus(List<Movie> movies, RecordStatus status) {
    return (int) movies.stream().filter(movie -> status == safeStatus(movie.getStatus())).count();
  }

  private int countGamesByStatus(List<Game> games, RecordStatus status) {
    return (int) games.stream().filter(game -> status == safeStatus(game.getStatus())).count();
  }

  private ProfileSummaryResponse.CountItem countItem(String key, String label, int count) {
    return new ProfileSummaryResponse.CountItem(key, label, count);
  }

  private RecordStatus safeStatus(RecordStatus status) {
    return status == null ? RecordStatus.UNSET : status;
  }

  private String inferMovieSource(Movie movie) {
    if (movie.getTmdbId() != null) {
      return "TMDB";
    }
    if (StringUtils.hasText(movie.getDoubanId())) {
      return "DOUBAN";
    }
    if (StringUtils.hasText(movie.getImdbId())) {
      return "IMDB";
    }
    if (StringUtils.hasText(movie.getTraktId())) {
      return "TRAKT";
    }
    return "MANUAL";
  }

  private String inferGamePlatform(Game game) {
    if (StringUtils.hasText(game.getPlatform())) {
      return game.getPlatform().trim().toUpperCase(Locale.ROOT);
    }
    if (game.getSteamAppId() != null) {
      return "STEAM";
    }
    if (StringUtils.hasText(game.getXboxId())) {
      return "XBOX";
    }
    if (StringUtils.hasText(game.getPsnId())) {
      return "PSN";
    }
    if (game.getRawgId() != null) {
      return "RAWG";
    }
    return "MANUAL";
  }

  private String statusLabel(RecordStatus status) {
    return switch (status) {
      case UNSET -> "未分类";
      case WANT -> "想记录";
      case IN_PROGRESS -> "进行中";
      case DONE -> "已完成";
    };
  }

  private String sourceLabel(String source) {
    return switch (source) {
      case "TMDB" -> "TMDB";
      case "DOUBAN" -> "豆瓣";
      case "IMDB" -> "IMDb";
      case "TRAKT" -> "Trakt";
      default -> "手动录入";
    };
  }

  private String platformLabel(String platform) {
    return switch (platform) {
      case "RAWG" -> "RAWG";
      case "STEAM" -> "Steam";
      case "XBOX" -> "Xbox";
      case "PSN" -> "PSN";
      default -> "手动录入";
    };
  }

  private Double roundOneDecimal(double value) {
    if (Double.isNaN(value)) {
      return null;
    }
    return Math.round(value * 10.0) / 10.0;
  }

  private record RecentSnapshot(
      String category,
      Long id,
      String title,
      String subtitle,
      String posterUrl,
      String status,
      Integer rating,
      LocalDateTime createdAt
  ) {}
}
