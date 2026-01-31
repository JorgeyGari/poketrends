# GitHub Pages + Docker Deployment Guide

## Overview
This project deploys the frontend to **GitHub Pages** (free, static hosting) and the backend to a container platform like **Render**, **Railway**, or **Fly.io** (with free tiers available).

## Prerequisites
- GitHub repository with Actions enabled (default)
- Docker Hub account (optional, for Docker image hosting)
- Render.com account (or another container host)

## Step 1: Configure GitHub Secrets
Add the following secrets to your GitHub repository (`Settings > Secrets and variables > Actions`):

### Required for backend deployment:
- `DOCKER_USERNAME` - Your Docker Hub username
- `DOCKER_PASSWORD` - Your Docker Hub access token
- `RENDER_DEPLOY_HOOK` - (optional) Your Render manual deploy hook URL

### Environment variables:
Set in `.github/workflows/deploy.yml` or as GitHub secrets:
- `VITE_API_BASE_URL` - URL of your deployed backend (e.g., `https://poketrends-api.onrender.com`)

## Step 2: Deploy Backend to Render (Recommended)

### Option A: Using Render's native Docker support (easiest)
1. Go to [Render.com](https://render.com)
2. Create a new **Web Service** → **Deploy from Docker Hub**
3. Enter the image: `<your-docker-username>/poketrends-backend:latest`
4. Set port to `3002`
5. Add environment variables (if needed):
   - `MAX_SEARCHES=2000000`
6. Deploy
7. Copy the service URL (e.g., `https://poketrends-backend.onrender.com`)
8. Add to GitHub secret `VITE_API_BASE_URL=https://poketrends-backend.onrender.com`

### Option B: Using Render's auto-deploy from GitHub
1. Push Dockerfile to main branch
2. On Render, create Web Service → Connect GitHub repo
3. Render will auto-build Docker image on push

## Step 3: Deploy Frontend to GitHub Pages

The workflow `.github/workflows/deploy.yml` automatically:
1. Installs dependencies
2. Builds frontend with Vite (including API base URL)
3. Publishes `dist/` to GitHub Pages branch

### Enable GitHub Pages:
1. Go to your repo → `Settings > Pages`
2. Set Source to `Deploy from a branch`
3. Select `gh-pages` branch and `/root` folder
4. (Optional) Add custom domain if you have one

## Step 4: Local Development

### Run backend locally:
```bash
npm install
node server.js
# Server runs on http://localhost:3002
```

### Run frontend locally:
```bash
npm run dev
# Frontend on http://localhost:5173, calls http://localhost:3002 (local backend)
```

### Test production build locally:
```bash
VITE_API_BASE_URL=https://your-backend-url npm run build
npm run preview
# Verify frontend connects to production backend
```

## Step 5: Verify Deployment

### Test backend health:
```bash
curl https://your-backend-url.onrender.com/health
# Should return: {"status": "ok"}
```

### Test frontend:
Visit `https://<your-github-username>.github.io/<repo-name>/`
- Check browser console for API calls to your backend URL
- Play a round and verify scores load

## Troubleshooting

### Frontend shows "Error" or loading spinner stuck:
- Check browser DevTools → Network tab
- Verify `VITE_API_BASE_URL` is set correctly in workflow
- Ensure backend service is running: `curl https://your-backend-url/health`
- Check CORS: backend must allow your GitHub Pages origin

### Backend returns 502 on Render:
- Check service logs in Render dashboard
- Verify `node server.js` runs locally: `npm install && node server.js`
- Ensure port 3002 is exposed in Dockerfile

### GitHub Actions fails:
- Check `.github/workflows/deploy.yml` logs in Actions tab
- Verify `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets are set
- Verify Node modules: `npm ci` should succeed locally

## Optional: Custom Domain

If you have a domain (e.g., `poketrends.example.com`):
1. Update `cname` in `.github/workflows/deploy.yml`
2. Add DNS A records pointing to GitHub Pages IPs:
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```
3. Or use CNAME record pointing to `<username>.github.io`

## File Reference

- **Frontend:** `src/js/` + `index.html` → builds to `dist/`
- **Backend:** `server.js` → Docker container on port 3002
- **Config:**
  - `vite.config.js` - Vite config with `__API_BASE_URL__` global
  - `src/js/services/TrendsApiService.js` - Uses `__API_BASE_URL__`
  - `.env.example` - Environment variable template
  - `Dockerfile` - Backend container spec

## Next Steps

1. Push `.github/workflows/deploy.yml` and `Dockerfile` to main branch
2. Create Docker Hub account if needed
3. Set GitHub secrets
4. Deploy backend to Render
5. Update `VITE_API_BASE_URL` secret
6. Push to main → GitHub Actions runs automatically → frontend deploys to Pages
