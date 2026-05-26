package com.pixelreel;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.pixelreel.mapper")
public class PixelreelApplication {
  public static void main(String[] args) {
    SpringApplication.run(PixelreelApplication.class, args);
  }
}

