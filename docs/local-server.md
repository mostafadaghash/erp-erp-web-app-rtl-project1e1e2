# Local Server Edition

This deployment is isolated from the existing Convex Cloud environments. It runs:

- PostgreSQL 17 for Convex persistence.
- The self-hosted Convex backend.
- The self-hosted Convex dashboard.
- The existing Vite frontend in a separate local-server mode.

## Safety boundaries

- Never commit `infra/local/runtime.env.local`, `infra/local/cli.env.local`, `infra/local/auth.env.local`, or `.env.local-server.local`.
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

Configure Convex Auth and deploy the project's functions to the empty local deployment with:

```powershell
npm run local:configure
```

The Auth key pair is generated once and retained in the ignored `infra/local/auth.env.local` file. The command targets the local URL and admin key explicitly, preserves the existing `.env.local` file, and does not change the existing Cloud deployment.
