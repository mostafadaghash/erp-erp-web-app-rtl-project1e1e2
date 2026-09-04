# Local Server Edition

This deployment is isolated from the existing Convex Cloud environments. It runs:

- PostgreSQL 17 for Convex persistence.
- The self-hosted Convex backend.
- The self-hosted Convex dashboard.
- The existing Vite frontend in a separate local-server mode.

## Safety boundaries

- Never commit `infra/local/runtime.env.local`, `infra/local/cli.env.local`, or `.env.local-server.local`.
- The first stage binds every port to `127.0.0.1`; other LAN devices cannot connect yet.
- `docker compose down` preserves the named volumes. Do not use `down -v` because it deletes local data.
- Cloud deployment variables are not changed by these scripts.

## First bootstrap

Start Docker Desktop, then run from the project root:

```powershell
npm run local:bootstrap
```

The script generates a random PostgreSQL password, starts all containers, waits for health checks, and stores the generated Convex admin key only in ignored local files.

Check service health with:

```powershell
npm run local:status
```

The next implementation step configures Convex Auth keys and deploys the project's functions to this empty local deployment.
