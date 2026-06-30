# Crown Stores Retail Management System (CSRMS) v2.0

A web-based retail management system for Crown Stores, built with **Node.js**, **EJS**, and **PostgreSQL**.

## Features

- **Authentication & RBAC** — Login, logout, password reset, session management
- **Role-based dashboards** — Director, Branch Manager, Sales Agent
- **Category & Product Management** — CRUD with barcode support
- **Procurement** — Record stock received from suppliers
- **Inventory** — Real-time stock, adjustments, movement history
- **Sales (POS)** — Barcode scan, product search, cash sales, receipts
- **Cashier Balancing** — Daily reconciliation and approval
- **Reports** — Daily sales, inventory, procurement, performance (with PDF export)
- **Notifications** — Low stock and out-of-stock alerts

## User Roles

| Role | Username | Password |
|------|----------|----------|
| Director | `director` | `director123` |
| Branch Manager | `manager` | `manager123` |
| Sales Agent | `agent` | `agent123` |

## Prerequisites

- Node.js 18+
- PostgreSQL running on your machine

## Quick Start (Windows)

Open **Git Bash**, **PowerShell**, or **Command Prompt** in the project folder:

```bash
npm install
copy .env.example .env
```

Edit `.env` and set `DB_PASSWORD` to your PostgreSQL password, then:

```bash
npm run db:init
npm start
```

Open http://localhost:3000

## Setup

### 1. Clone and install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example env file and edit it with your PostgreSQL credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
SESSION_SECRET=your-random-secret-key

DB_HOST=localhost
DB_PORT=5432
DB_NAME=csrms
DB_USER=postgres
DB_PASSWORD=your_postgres_password
```

### 3. Create database and schema

```bash
npm run db:setup
```

### 4. Seed sample data

```bash
npm run db:seed
```

**Or run both in one command:**

```bash
npm run db:init
```

### 5. Start the server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For development with auto-reload:

```bash
npm run dev
```

## Business Flow

```
Manager Creates Category
  → Manager Creates Product
  → Supplier Delivers Products
  → Manager Records Procurement
  → Inventory Updated
  → Sales Agent Processes Sale
  → Receipt Generated
  → Inventory Reduced
  → Cashier Balancing
  → Reports Updated
  → Director Reviews Performance
```

## Project Structure

```
├── config/database.js      # PostgreSQL connection pool
├── database/schema.sql     # Database schema
├── middleware/             # Auth, session locals
├── routes/                 # Express route handlers
├── views/                  # EJS templates
├── public/css/             # Stylesheets
├── scripts/                # DB setup and seed scripts
└── server.js               # Application entry point
```

## Tech Stack

- **Backend:** Node.js, Express.js
- **Views:** EJS
- **Database:** PostgreSQL
- **Auth:** bcryptjs, express-session (PostgreSQL store)
- **PDF:** PDFKit

## License

Proprietary — Crown Stores
