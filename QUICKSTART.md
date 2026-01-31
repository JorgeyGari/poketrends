# Deployment Checklist

## ✅ What's been set up:

- [x] **Dockerfile** for backend (`server.js`)
- [x] **.dockerignore** to optimize build
- [x] **vite.config.js** with `__API_BASE_URL__` support
- [x] **GitHub Actions workflow** (`.github/workflows/deploy.yml`)
  - Auto-builds frontend and publishes to GitHub Pages
  - Auto-builds Docker image on push to main
  - Supports deploy hooks for container platforms
- [x] **TrendsApiService.js** updated to use configurable API base URL
- [x] **.env.example** for reference
- [x] **DEPLOYMENT.md** with complete step-by-step guide

## 🚀 Next steps to go live:

### 1. Local verification (2 min)
```bash
npm install
npm run build          # ✓ Builds to dist/
node server.js         # ✓ Runs on :3002 locally
```

### 2. GitHub setup (5 min)
- [ ] Push this branch to GitHub
- [ ] Go to repo Settings > Secrets and variables > Actions
- [ ] Add secrets:
  - `DOCKER_USERNAME` = your Docker Hub username
  - `DOCKER_PASSWORD` = your Docker Hub access token (or PAT)

### 3. Deploy backend (10 min)
- [ ] Sign up at [Render.com](https://render.com) (free tier available)
- [ ] Create Web Service → "Deploy from Docker Hub"
- [ ] Enter image: `<username>/poketrends-backend:latest`
- [ ] Set port to `3002`
- [ ] Copy service URL (e.g., `https://poketrends-backend.onrender.com`)

### 4. Configure frontend (2 min)
- [ ] Add GitHub secret `VITE_API_BASE_URL=https://poketrends-backend.onrender.com`
- [ ] Update `.github/workflows/deploy.yml` line 11 to use this secret
- [ ] Push to main → GitHub Actions auto-deploys

### 5. Enable GitHub Pages (2 min)
- [ ] Repo Settings > Pages
- [ ] Source: `Deploy from a branch`
- [ ] Branch: `gh-pages`, folder: `/ (root)`

### 6. Verify (3 min)
- [ ] Check Actions tab → both workflows pass ✓
- [ ] Visit `https://<username>.github.io/<repo-name>/`
- [ ] Play a game → verify scores load from your backend
- [ ] Browser console → no CORS errors

## 📝 Files created/modified:

| File | Purpose |
|------|---------|
| **Dockerfile** | Backend container spec |
| **.dockerignore** | Build optimization |
| **vite.config.js** | Frontend build config with env vars |
| **.github/workflows/deploy.yml** | CI/CD pipeline |
| **src/js/services/TrendsApiService.js** | Uses configurable API base URL |
| **.env.example** | Environment variable template |
| **DEPLOYMENT.md** | Comprehensive deployment guide |

## 🔗 References:

- [Render.com free tier](https://render.com/pricing)
- [GitHub Pages docs](https://docs.github.com/en/pages)
- [Docker Hub](https://hub.docker.com/)
- More help in **DEPLOYMENT.md**
