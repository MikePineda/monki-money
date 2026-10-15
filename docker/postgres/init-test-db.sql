-- Runs once, when the dev Postgres volume is first initialised.
-- Creates the database used by the Japa suite (apps/api/.env.test).
CREATE DATABASE monkimoney_test OWNER monkimoney;
