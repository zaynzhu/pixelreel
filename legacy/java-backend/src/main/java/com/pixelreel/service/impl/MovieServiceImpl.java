package com.pixelreel.service.impl;

import com.pixelreel.entity.Movie;
import com.pixelreel.mapper.MovieMapper;
import com.pixelreel.service.MovieService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

@Service
public class MovieServiceImpl extends ServiceImpl<MovieMapper, Movie> implements MovieService {}

