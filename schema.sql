-- ============================================================
-- schema.sql — Esquema de la base de datos de la calculadora
-- Compatible con MySQL 8+ y MariaDB 10.4+ (p. ej. WAMP).
--
-- Uso en local (WAMP):
--   Opción 1: phpMyAdmin (http://localhost/phpmyadmin) → pestaña
--             "Importar" → elegir este archivo → "Continuar".
--   Opción 2: C:\wamp64\bin\mysql\mysql8.0.31\bin\mysql.exe -u root < schema.sql
-- En Aiven/otro proveedor: pega este archivo en el SQL Editor
-- de su consola y ejecútalo.
--
-- IMPORTANTE: si eliges otro nombre de base, cámbialo aquí
-- y usa el mismo valor en la variable de entorno DB_NAME.
-- ============================================================

CREATE DATABASE IF NOT EXISTS `calculadora`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `calculadora`;

CREATE TABLE IF NOT EXISTS `calculos` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `metodo`     ENUM('bairstow', 'ridders') NOT NULL,
  `entradas`   JSON NOT NULL,
  `resultados` JSON NOT NULL,
  `fecha`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
