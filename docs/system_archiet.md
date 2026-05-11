# Agricultural Management Information System (AMIS)
## System Architecture

**Project:** Agri-Tech Agricultural Management Information System
**Institution:** Bahcesehir Cyprus University

---

## 1. Architecture Overview

AMIS adopts a **multi-layer physical architecture** designed for scalability, maintainability, security, and efficient service integration across a multi-sector agricultural enterprise. The architecture enforces a strong **separation of concerns** by organizing responsibilities into five clearly defined layers. All subsystems share a centralized data layer and communicate through a unified API gateway, ensuring data consistency while preserving module independence.

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                         │
│   Web App (React/TS)  │  PWA (Mobile)  │  Admin Dashboard       │
│              Report Generator │ API Gateway (REST/GraphQL)       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                  BUSINESS LOGIC LAYER (ERP Modules)             │
│  Inventory │ Production │ HR/Labor │ Sales │ Assets │ Reporting  │
│         Procurement │ Finance │ CRM │ Security │ Sys Admin       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                  INTEGRATION & SERVICES LAYER                   │
│  Auth Service │ Notification Service │ File Storage Service      │
│         External API Integrations │ Payment Gateway              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                         DATA LAYER                              │
│   PostgreSQL DB │ File Storage │ Redis Cache │ Backup & Recovery │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    INFRASTRUCTURE LAYER                         │
│   Cloud Hosting (AWS/GCP) │ Load Balancer │ CDN │ SSL/TLS        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer Descriptions

### 2.1 Presentation Layer

The Presentation Layer is the user-facing interface through which both on-site staff and remote management interact with the system.

**Components:**

| Component | Technology | Purpose |
|---|---|---|
| Web Application | React + TypeScript | Primary interface for all desktop users |
| Mobile Interface (PWA) | Progressive Web App | Responsive mobile access; offline capability for rural environments |
| Admin Dashboard | React + TypeScript | System monitoring, user management, configuration |
| Report Generator | PDF/Excel export libraries | Generate and export operational reports |
| API Gateway | REST / GraphQL | Standardizes and manages all client-to-backend communication |

**Responsibilities:**
- Render user interfaces for all functional modules.
- Handle client-side form validation and state management.
- Communicate with the Business Logic Layer exclusively through the API Gateway.
- Enforce UI-level access restrictions based on user roles retrieved from the auth service.

---

### 2.2 Business Logic Layer (Application / ERP Modules Layer)

The Business Logic Layer hosts all core application services and operational logic. It processes user requests, enforces business rules, validates data, and coordinates interactions between modules.

**Functional Modules:**

| Module | Key Functions |
|---|---|
| **Inventory Management** | Track inputs/outputs, feeds, harvested goods; reorder alerts |
| **Production Management** | Crop records, livestock data, aquaculture tracking, daily logs |
| **Human Capital Management** | Employee records, attendance, task assignment |
| **Sales & Distribution** | Sales transactions, customer records, distribution logs, revenue summaries |
| **Asset Management** | Equipment registry, vehicle/tool tracking, maintenance scheduling |
| **Reporting & Analytics** | Dashboards, trend reports, KPI generation, export |
| **Quality Control** | Input/output quality checks and compliance recording |
| **Procurement** | Purchase orders, supplier management, procurement workflows |
| **Customer Relationship Management (CRM)** | Customer profiles, interaction history, contract management |
| **Finance & Accounting** | Revenue tracking, cost recording, financial summaries |
| **System Administration** | User management, module configuration, farm-specific settings |
| **Security & Access Control** | RBAC enforcement, session management, audit logging |

**Responsibilities:**
- Execute all business rule validations before data persistence.
- Orchestrate cross-module workflows (e.g., production entry → inventory update → report refresh).
- Manage role-based permissions at the service level.
- Expose well-defined API endpoints consumed by the Presentation Layer.

---

### 2.3 Integration & Services Layer

The Integration and Services Layer facilitates communication between the Business Logic Layer and both internal and external services. It provides reusable, shared services consumed across multiple modules.

**Components:**

| Service | Purpose |
|---|---|
| **Authentication Service** | JWT token issuance, validation, session lifecycle management |
| **Notification Service** | Email/SMS alerts (e.g., reorder alerts, task assignments, system events) |
| **File Storage Service** | Document and image upload/retrieval (contracts, reports, photos) |
| **External API Integrations** | Third-party agricultural data services, weather APIs, government reporting |
| **Payment Gateway** | Financial transaction processing for sales and procurement (future phase) |

**Responsibilities:**
- Decouple cross-cutting concerns from core business modules.
- Enable seamless third-party integration without modifying core system logic.
- Provide shared, reusable infrastructure services (auth, notifications, file storage) accessible across all modules.

---

### 2.4 Data Layer

The Data Layer is responsible for all persistent data storage, fast data access, and data protection.

**Components:**

| Component | Technology | Purpose |
|---|---|---|
| **Relational Database** | PostgreSQL | Primary structured data store for all operational records |
| **File Storage** | AWS S3 / GCP Cloud Storage | Documents, images, exported reports, contract files |
| **Cache Layer** | Redis | In-memory caching for high-frequency queries and session data |
| **Backup & Recovery** | Automated cloud snapshots | Data protection and disaster recovery |

**Database Design Principles:**
- Normalized relational schema with foreign key constraints to enforce data integrity.
- Indexed on frequently queried fields (inventory IDs, dates, user IDs, farm IDs).
- Multi-tenancy support at the schema or row level for multi-farm deployments.
- Soft deletes (archived records) to preserve audit trails without permanent data loss.

**Key Database Entities (High-Level):**

```
farms            → id, name, location, config_settings
users            → id, farm_id, name, role, credentials
inventory_items  → id, farm_id, name, category, quantity, unit, reorder_threshold
production_logs  → id, farm_id, sector, date, output_quantity, notes
employees        → id, farm_id, name, role, contract_type
attendance_logs  → id, employee_id, date, status, activity
sales            → id, farm_id, customer_id, product_id, quantity, price, date
customers        → id, farm_id, name, contact_info
assets           → id, farm_id, name, type, status, acquisition_date
maintenance_logs → id, asset_id, date, description, cost
reports          → id, farm_id, type, generated_at, file_path
```

---

### 2.5 Infrastructure Layer

The Infrastructure Layer provides the underlying computing and network environment for deploying and operating the system.

**Components:**

| Component | Technology | Purpose |
|---|---|---|
| **Cloud Hosting** | AWS or GCP | Scalable virtual servers for application and database hosting |
| **Load Balancer** | AWS ELB / GCP Load Balancing | Distribute traffic across multiple backend instances |
| **CDN** | AWS CloudFront / GCP Cloud CDN | Faster content delivery; reduce latency for distributed users |
| **SSL/TLS** | Let's Encrypt / AWS ACM | Encrypt all data in transit; enforce HTTPS |
| **Container Orchestration** | Docker + (optionally) Kubernetes | Consistent deployment across environments |
| **CI/CD Pipeline** | GitHub Actions / GitLab CI | Automated testing, build, and deployment pipelines |

---

## 3. Security Architecture

### 3.1 Authentication & Authorization
- **JWT-based authentication** — stateless tokens issued on login, verified on each API request.
- **Role-Based Access Control (RBAC)** — enforced at both the API Gateway and service layers.
- **Defined roles:** Super Admin, Farm Administrator, Farm Manager, Supervisor, Field Worker, Viewer (remote management).

### 3.2 Data Security
- All API traffic encrypted via HTTPS/TLS.
- Database passwords and secrets stored in environment variables or a secrets manager (AWS Secrets Manager / GCP Secret Manager).
- Sensitive data encrypted at rest in the PostgreSQL database.
- File uploads scanned and stored in private cloud buckets with signed URLs.

### 3.3 Audit Logging
- All data modification events logged with user ID, timestamp, action type, and affected record.
- Admin-accessible audit trail for governance and compliance.

### 3.4 Session Management
- Short-lived access tokens with refresh token rotation.
- Session invalidation on logout and on password change.

---

## 4. Data Flow Architecture

### 4.1 Standard Request Flow
```
User (Browser/PWA)
  → HTTPS Request
  → CDN (static assets) / Load Balancer (API)
  → API Gateway (REST/GraphQL)
  → Auth Middleware (JWT validation + RBAC check)
  → Business Logic Module (service layer)
  → Data Layer (PostgreSQL via ORM, Redis for cache)
  → Response → User
```

### 4.2 Cross-Module Data Flow Example (Production → Inventory → Reporting)
```
Farm worker logs a harvest entry (Production Management)
  → Production service validates and persists record
  → Inventory service listener triggered → updates stock levels
  → If stock below threshold → Notification Service sends reorder alert
  → Reporting service marks dashboard data as stale → refreshes on next request
```

---

## 5. Deployment Architecture

### 5.1 Environment Strategy

| Environment | Purpose |
|---|---|
| **Development** | Local developer machines; Docker Compose for local services |
| **Staging** | Cloud-hosted mirror of production for integration testing and UAT |
| **Production** | Full cloud deployment with load balancing, CDN, and automated backups |

### 5.2 Deployment Topology (Production)

```
                         [Internet]
                              │
                    [CDN - CloudFront/GCP CDN]
                              │
                    [Load Balancer - HTTPS only]
                     /                      \
          [App Server 1]              [App Server 2]
          (Node/Python API)          (Node/Python API)
                     \                      /
                      [Shared PostgreSQL DB]
                      [Redis Cache Cluster]
                      [Cloud Object Storage]
```

### 5.3 Scalability Strategy
- Stateless API servers enable horizontal scaling (add instances behind the load balancer).
- Redis cache reduces database read pressure under high concurrent load.
- PostgreSQL read replicas can be added for reporting/analytics workloads.
- CDN serves all static frontend assets globally, reducing server load.

---

## 6. Subsystem Integration Architecture

### 6.1 Integration Approach
All subsystems integrate through:
1. A **shared centralized PostgreSQL database** — single source of truth, no cross-subsystem data duplication.
2. A **unified API Gateway** — all inter-module communication goes through defined API contracts; no direct database cross-access between modules.
3. **Event-driven updates** — state changes in one module trigger listeners in dependent modules (e.g., inventory update on production log entry).

### 6.2 Phased Integration Order

```
Phase 1: IMS (Inventory Management System)
  → Foundation module; all other subsystems reference inventory data.

Phase 2: Production Management
  → Connects to IMS to update stock on harvest/output events.

Phase 3: HR & Asset Management
  → Links to Production logs for labor and equipment usage tracking.

Phase 4: Sales & Distribution
  → Connects to IMS (stock deduction on sale) and Reporting.

Phase 5: Reporting & Decision Support
  → Aggregates data from all modules; final integration step.
```

### 6.3 API Contract Standards
- All APIs follow RESTful conventions (or GraphQL for flexible querying).
- JSON request/response format with standardized error codes.
- Versioned API endpoints (`/api/v1/...`) to support backward-compatible evolution.
- Rate limiting applied at the API Gateway level.

---

## 7. Technology Stack Summary

| Concern | Technology |
|---|---|
| **Frontend Framework** | React 18+ with TypeScript |
| **State Management** | Redux Toolkit or Zustand |
| **PWA** | Service Workers, Web App Manifest |
| **API Gateway** | REST (Express.js / FastAPI) or GraphQL (Apollo) |
| **Backend Runtime** | Node.js or Python (FastAPI / Django REST Framework) |
| **ORM** | Prisma (Node.js) or SQLAlchemy (Python) |
| **Primary Database** | PostgreSQL 15+ |
| **Cache** | Redis 7+ |
| **File Storage** | AWS S3 or GCP Cloud Storage |
| **Authentication** | JWT + Refresh Tokens; bcrypt password hashing |
| **Cloud Provider** | AWS (preferred) or GCP |
| **Containerization** | Docker + Docker Compose |
| **CI/CD** | GitHub Actions |
| **SSL/TLS** | AWS ACM / Let's Encrypt |
| **CDN** | AWS CloudFront or GCP Cloud CDN |
| **Monitoring** | AWS CloudWatch / GCP Monitoring (or open-source: Grafana + Prometheus) |
| **PDF Export** | Puppeteer or WeasyPrint |
| **Excel Export** | xlsx.js (Node) or openpyxl (Python) |

---

## 8. Architecture Design Principles

- **Modularity** — Each subsystem is independently deployable and testable. Adding or deactivating a module does not require changes to the core system.
- **Separation of Concerns** — Clear layer boundaries (presentation, logic, integration, data, infrastructure) with no layer bypassing the one above it.
- **Single Source of Truth** — All subsystems read from and write to the same centralized database via the API layer.
- **Security by Default** — Authentication and RBAC enforced on every API call; no public endpoints except login.
- **Cost Efficiency** — Open-source stack; cloud-native with pay-as-you-scale infrastructure.
- **Offline Resilience** — PWA with service workers for basic functionality in low/no connectivity environments.
- **Configurability** — Farm-specific settings stored in configuration tables, not hardcoded, enabling multi-farm deployments from the same codebase.

---

*Document version: 1.0 — Derived from Capstone I Report, Bahcesehir Cyprus University, 2026*
