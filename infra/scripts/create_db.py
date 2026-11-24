"""Idempotently create the application role and database (used by setup.sh).

Usage: python create_db.py <superuser-dsn> <app_user> <app_password> <app_db>
"""
import sys

import psycopg
from psycopg import sql


def main(dsn, user, password, dbname):
    with psycopg.connect(dsn, autocommit=True) as conn:
        if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (user,)).fetchone():
            conn.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD {} CREATEDB").format(sql.Identifier(user), sql.Literal(password)))
            print(f"role {user} created")
        if not conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,)).fetchone():
            conn.execute(sql.SQL("CREATE DATABASE {} OWNER {} ENCODING 'UTF8'").format(sql.Identifier(dbname), sql.Identifier(user)))
            print(f"database {dbname} created")
        print(conn.execute("SHOW server_version").fetchone()[0])


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(*sys.argv[1:])
