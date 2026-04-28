# Food Network MVP

A mobile-first web application that displays a scrolling feed of food resources (food banks, distributions, meal services) across San Diego County.

## Tech Stack
* **Frontend:** React + Vite
* **Styling:** Tailwind CSS (v4)
* **Backend:** Supabase (PostgreSQL, Auth, Storage)
* **Routing:** React Router DOM
* **Icons:** Lucide React
* **Date Formatting:** date-fns

## Project Structure

```
food-network/
├── public/                 # Static assets
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── FilterBar.jsx   # Horizontal scrolling category filter
│   │   └── PostCard.jsx    # Individual food resource display card
│   ├── hooks/              # Custom React hooks
│   │   └── usePosts.js     # Supabase data fetching logic
│   ├── pages/              # Page components
│   │   ├── Admin.jsx       # Simple form to add new resources to Supabase
│   │   └── Home.jsx        # Main feed displaying food resources
│   ├── supabase.js         # Supabase client configuration
│   ├── App.jsx             # Main application component & routing (Currently modified for connection testing)
│   ├── main.jsx            # Application entry point
│   └── index.css           # Global styles and Tailwind configuration
├── .env                    # Environment variables (Supabase keys)
├── supabase-schema.sql     # Database schema, table definitions, and RLS policies
└── vite.config.js          # Vite build and tailwind plugin configuration
```

## Features Implemented
* **Mobile-First Feed:** A responsive, scannable list of food resources with essential details (time, location, tags).
* **Category Filtering:** Filter resources by type (e.g., Groceries, Hot Meals).
* **Get Directions:** Direct integration linking resource addresses to Google Maps.
* **Database Schema:** Fully defined PostgreSQL schema for `organizations` and `posts` with Row Level Security.
* **Admin Page:** Simple interface for creating new posts and uploading images directly to Supabase storage.

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   Ensure your `.env` file is present in the root directory and contains your Supabase credentials.

3. **Database Setup**
   Copy the contents of `supabase-schema.sql` and run it in your Supabase project's SQL Editor to create the necessary tables, storage buckets, and security policies.

4. **Run Locally**
   ```bash
   npm run dev
   ```

5. **Deployment**
   The application is configured to be deployed easily via Netlify.
   * **Build Command:** `npm run build`
   * **Publish Directory:** `dist`
