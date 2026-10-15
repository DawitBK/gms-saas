# Operations & Administration Module

The Operations module is the administrative backbone of the GMS, providing high-level visibility and management tools for the enterprise infrastructure.

## Core Responsibilities

### 1. Real-time Analytics

- **Dashboard Stat Cards**: Aggregated metrics for active visits, checked-in guests, and active credentials.
- **Trend Analysis**: Daily arrival trends (7-day window) and status distribution charts.
- **Integration Health**: Real-time monitoring of Redis, UniFi, and Sentry connectivity.

### 2. Organizational Provisioning

- **Bulk Import**: Excel-based seeding of users, departments, and offices.
- **Organisation Integrity**: Auditing and fixing organization tree mismatches (e.g., hosts without departments).

### 3. Simulation Engine

- Managed via `simulation.routes.ts`.
- Orchestrates the high-fidelity `simulation-engine.js` for stress testing and data seeding.

## Data Structures

- **OperationsDashboardDTO**: Unified response for the Admin/Reception overview.
- **OperationsReportDTO**: Structured data for Excel/PDF exports.

## Key Services

- **OperationsService**: Orchestrates complex analytical queries and data transformations.
- **OperationsRepository**: Executes raw SQL for performance-optimized metric aggregation.
