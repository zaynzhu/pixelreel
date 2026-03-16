package com.pixelreel.controller;

import com.pixelreel.entity.Game;
import com.pixelreel.service.GameService;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/games")
@RequiredArgsConstructor
public class GameController {
  private final GameService gameService;

  @GetMapping
  public List<Game> list() {
    return gameService.list();
  }

  @GetMapping("/{id}")
  public Game get(@PathVariable Long id) {
    return gameService.getById(id);
  }

  @PostMapping
  public Game create(@Valid @RequestBody Game game) {
    game.setId(null);
    gameService.save(game);
    return game;
  }

  @PutMapping("/{id}")
  public Game update(@PathVariable Long id, @Valid @RequestBody Game game) {
    game.setId(id);
    gameService.updateById(game);
    return gameService.getById(id);
  }

  @DeleteMapping("/{id}")
  public void delete(@PathVariable Long id) {
    gameService.removeById(id);
  }
}

