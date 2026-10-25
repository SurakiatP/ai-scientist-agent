#!/bin/sh
# Runs once, on first start of an empty data dir (docker-entrypoint-initdb.d). Creates the NON-superuser role and database the app uses.
# POSTGRES_USER=postgres (superuser) is only for admin/pg_dump inside the container; the backend never gets its password.
set -eu
psql -v ON_ERROR_STOP=1 -v pw="$APP_PW" -U postgres -d postgres <<'SQL'
CREATE ROLE app LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE app OWNER app;
REVOKE ALL ON DATABASE app FROM PUBLIC;
SQL
