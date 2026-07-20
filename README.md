# أريد إنشاء ERP

أريد إنشاء ERP Web App عربي RTL قابل للبيع لمحلات اللابتوب والموبايل والبلا

This is a project built with Stunning.



## Project structure

The frontend code is in the `app` directory and is built with [Vite](https://vitejs.dev/).

The backend code is in the `convex` directory.

`npm run dev` will start the frontend and backend servers.

## App authentication

Stunning apps use built-in authentication with Anonymous auth for easy sign in. You may wish to change this before deploying your app.

## Developing and deploying your app

Your full-stack application includes:
* Built-in database for data storage
* Authentication system with multiple providers
* File upload and storage capabilities
* Real-time UI updates
* Background workflows and scheduled tasks

## HTTP API

User-defined http routes are defined in the `convex/router.ts` file. We split these routes into a separate file from `convex/http.ts` to allow us to prevent the LLM from modifying the authentication routes.
