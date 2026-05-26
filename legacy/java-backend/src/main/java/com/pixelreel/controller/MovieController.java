package com.pixelreel.controller;

import com.pixelreel.dto.external.ExternalMovieSearchResult;
import com.pixelreel.dto.external.ExternalSearchResponse;
import com.pixelreel.entity.Movie;
import com.pixelreel.service.ExternalSearchService;
import com.pixelreel.service.MovieService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/movies")
@RequiredArgsConstructor
public class MovieController {
  private final MovieService movieService;
  private final ExternalSearchService externalSearchService;

  @GetMapping("/search")
  public ExternalSearchResponse<ExternalMovieSearchResult> search(@RequestParam String query,
                                                                  @RequestParam(defaultValue = "1") int page,
                                                                  @RequestParam(required = false) List<String> providers) {
    return externalSearchService.searchMovies(query, page, providers);
  }

  @GetMapping
  public List<Movie> list() {
    return movieService.list();
  }

  @GetMapping("/{id}")
  public Movie get(@PathVariable Long id) {
    return movieService.getById(id);
  }

  @PostMapping
  public Movie create(@Valid @RequestBody Movie movie) {
    movie.setId(null);
    movieService.save(movie);
    return movie;
  }

  @PutMapping("/{id}")
  public Movie update(@PathVariable Long id, @Valid @RequestBody Movie movie) {
    movie.setId(id);
    movieService.updateById(movie);
    return movieService.getById(id);
  }

  @DeleteMapping("/{id}")
  public void delete(@PathVariable Long id) {
    movieService.removeById(id);
  }
}


