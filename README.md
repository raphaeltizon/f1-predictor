# F1 Prediction Championship (2026 Season)

A premium, interactive web application built with **Next.js 14 (App Router)** and **Tailwind CSS** that lets Formula 1 enthusiasts test their knowledge. Predict Qualifying grids, Sprint Races, and final Grand Prix finishing orders. Compete with players worldwide, earn points based on accuracy, and climb to the top of the Championship Leaderboard!

---

## 🏎️ Key Features

- **Dynamic Race Schedule**: Automatically pulls the official 2026 F1 Grand Prix calendar and session times.
- **Next Session Countdown**: Features a live countdown timer showing precisely when the next lockable session begins.
- **Top 10 Prediction Grids**: Drag-and-drop/interactive reordering to arrange your predicted top 10 finishers plus the fastest lap.
- **Automated Prediction Locking**: Locks predictions automatically the second a session starts, ensuring fair play.
- **Global Leaderboard**: An interactive standings board featuring podium animations for the top three players and a real-time search utility.
- **Admin Dashboard & Jolpica API Sync**: Synchronize actual results directly from the official **Jolpica Ergast F1 API** to automatically score all user submissions.
- **Local Simulation / Mock Mode**: A fully functioning offline mode allowing the entire application to be run and tested without setting up database infrastructure.

---

## 📊 Scoring System

Points are calculated individually for each predicted position in the Top 10 and the Fastest Lap:

| Accuracy Level | Points Awarded | Description |
| :--- | :---: | :--- |
| **Exact Match** | **10 PTS** | The driver finished exactly in the position you predicted. |
| **Off-by-One Match** | **5 PTS** | The driver finished 1 position above or below your prediction. |
| **In Top 10 Match** | **2 PTS** | The driver finished in the top 10, but more than 1 position away from your prediction. |
| **Fastest Lap Match** | **5 PTS** | You correctly predicted which driver set the fastest lap (Grand Prix / Sprint sessions only). |

---

## ⚡ Architecture & Dual Mode

The application implements a smart **Dual Database Mode** to allow seamless local testing and robust production deployment:

### 1. Mock Mode (Default)
If no Firebase environment variables are configured, the app runs locally without a backend.
- **Authentication**: Simulates user authentication with custom usernames.
- **Storage**: Backs up predictions, user scores, and cached schedules in the browser's `localStorage`.
- **Simulation**: In the Admin Dashboard (`/admin`), you can generate randomized actual results and simulate scoring for mock users to see how the leaderboard dynamically updates.

### 2. Production Firebase Mode
By supplying your Firebase credentials, the app turns into a full-stack multi-user platform.
- **Authentication**: Secure login using Google Auth via Firebase Authentication.
- **Database**: Stores all user predictions, standings, and official results in Firestore.
- **Synchronization**: Syncs actual race data from the Jolpica API to trigger live scoring updates.

---

## 📁 Project Structure

```text
├── src/
│   ├── app/                      # Next.js App Router Pages
│   │   ├── admin/                # Admin Panel (Trigger API Syncing & Mock Simulations)
│   │   ├── leaderboard/          # Global standings list with search and podium
│   │   ├── predictions/          # Submission screen for arranging driver predictions
│   │   ├── results/              # View official race weekend session outcomes
│   │   ├── globals.css           # Custom theme setup with carbon-fiber & glass styling
│   │   ├── layout.tsx            # Root Shell and Context wrapper
│   │   └── page.tsx              # Main Dashboard and weekend highlights
│   ├── components/
│   │   ├── Countdown.tsx         # Real-time counter for session lockouts
│   │   └── Navbar.tsx            # Navigation bar with user profile actions
│   ├── context/
│   │   └── AuthContext.tsx       # Auth provider wrapping Firebase & Mock-Auth state
│   └── lib/
│       ├── f1Api.ts              # API client fetching data from Ergast/Jolpica with cache
│       ├── firebase.ts           # Firebase SDK initialization & LocalStorage fallbacks
│       └── predictions.ts        # Database helpers & Prediction scoring logic
├── public/                       # Static public assets
├── .env.local.template           # Template for custom configuration
├── tailwind.config.ts            # Premium Formula 1 color schemes and skew utilities
└── package.json                  # Dependencies and execution scripts
```

---

## 🛠️ Setup & Local Development

### 1. Install Dependencies
Make sure you have Node.js installed, then run:
```bash
npm install
```

### 2. Configure Environment Variables (Optional)
To use production Firebase features, copy `.env.local.template` to `.env.local` and enter your Firebase app credentials:
```bash
cp .env.local.template .env.local
```
Edit `.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
...
```

### 3. Run the Development Server
Start the dev environment:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

### 4. Build for Production
To construct a compiled, optimized bundle:
```bash
npm run build
npm run start
```

---

## 🛠️ Admin Operations & Scoring

To score users' submissions once a race weekend ends:
1. Log in to the application.
2. Navigate to the **Admin Dashboard** (`/admin`). (If running in Firebase mode, ensure your user profile has administrative authorization, or configure it via Firebase console).
3. Select the round and session (Qualifying, Sprint, or Race) you want to score.
4. Click **Sync and Score** to fetch official data from the API and update the rankings.
5. In **Mock Mode**, use the simulation generators to populate mock driver layouts and view the standings immediately!
