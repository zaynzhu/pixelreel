package com.pixelreel.service.impl;

import com.pixelreel.entity.Game;
import com.pixelreel.mapper.GameMapper;
import com.pixelreel.service.GameService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

@Service
public class GameServiceImpl extends ServiceImpl<GameMapper, Game> implements GameService {}

