# Agricultural Management Information System (AMIS)
## Project Specifications & Technical Design

**Project Title:** Agricultural Management Information System (AMIS)
**Institution:** Bahcesehir Cyprus University — Faculty of Architecture and Engineering
**Team:** G. Tarnue Gayflor (ID: 3231690), Annette Anita Sannoh (ID: 32321911), Henry Smith Arinatwe (ID: 32012511)
**Advisor:** Prof. Dr. Acheme Okolobia Odeh

---

## 1. Project Overview

AMIS is a centralized, role-based, web-based Management Information System designed for multi-sector agricultural enterprises. It replaces fragmented spreadsheet-based management (Excel/Google Sheets) with an integrated digital platform that supports inventory tracking, production management, human resource management, sales, asset tracking, and reporting.

The system targets agricultural operations in the African context — particularly multi-sector farms encompassing crop production, livestock rearing, and aquaculture — where remote management, limited internet connectivity, and non-technical staff are real operational constraints.

---

## 2. Problem Statement

Multi-sector agricultural enterprises currently rely on fragmented, spreadsheet-based tools that are inadequate for the growing complexity of modern farm operations. The key problems are:

- **Fragmented records** across multiple Excel and Google Sheets files result in duplicated data, inconsistencies, and no single source of truth.
- **No real-time visibility** into inventory levels, asset usage, or production outputs, causing overstocking, shortages, and resource waste.
- **Inefficient reporting** through manual, periodic updates leads to delayed information flow and reactive rather than proactive decision-making.
- **Weak access control** — shared spreadsheets provide no role-based permissions, creating risks of unauthorized access and accidental data manipulation.
- **Limited scalability** — spreadsheet-based management cannot support expansion from county-level to national and international operations.

---

## 3. Conceptual Solution

Three solutions were evaluated:

1. **Continued spreadsheet use** — Rejected: not scalable, no access control, no real-time data.
2. **Off-the-shelf ERP adoption** — Rejected: expensive, overly complex, misaligned with local agricultural workflows.
3. **Custom web-based MIS (AMIS)** — Selected: flexible, affordable, tailored to Agri-Tech's operational needs, and supports long-term growth.

---

## 4. Functional Requirements

### 4.1 Centralized Data Management
- Replace all fragmented spreadsheets with a single integrated platform.
- Store all agricultural data (inventory, production, labor, assets, contracts, sales) in one centralized system.
- Provide a single reliable source of truth accessible to authorized users.

### 4.2 Inventory Tracking
- Track inventory levels for all inputs (seeds, fertilizers, chemicals), livestock/fish feeds, and finished goods.
- Provide real-time stock visibility across all farming sectors.
- Generate automated reorder alerts when stock reaches predefined thresholds.

### 4.3 Production Management
- Record and monitor production data across all agricultural sectors (crops, livestock, aquaculture).
- Capture planting, cultivation, harvest, livestock growth, health treatments, fish stocking, and daily production logs.
- Enable cross-sector comparison of production outputs.

### 4.4 Sales, Contracts, and Customer Management
- Record all sales transactions (quantities, prices, dates).
- Maintain customer records and contractual agreements.
- Support revenue tracking, distribution logs, and automated revenue summaries.

### 4.5 Human Resource and Labor Management
- Manage employee and contractor records (personal, contractual, role information).
- Record daily attendance and work activity logs.
- Support task assignment and supervisor monitoring of workforce activities.

### 4.6 Asset Tracking
- Track all company-owned agricultural assets (equipment, vehicles, tools, infrastructure).
- Record asset usage, availability, condition, and maintenance histories.
- Support maintenance scheduling to reduce downtime and extend asset lifespan.

### 4.7 Reporting and Decision Support
- Generate automated, real-time operational dashboards with key performance indicators.
- Produce trend and performance reports across all subsystems.
- Support exportable reports in PDF and Excel formats for auditing and external reporting.

### 4.8 Role-Based Access Control (RBAC)
- Enforce role-based user access so users only interact with data relevant to their responsibilities.
- Support user roles including system administrator, farm manager, supervisor, field worker, and remote management.
- Prevent unauthorized access, accidental data manipulation, and breaches of data confidentiality.

### 4.9 System Customization and Configurability
- Allow administrators to define farm-specific settings (production categories, inventory types, workflows, reporting formats, user roles) without modifying core system code.
- Support selective activation or deactivation of functional modules per farm deployment.
- Preserve a standardized system architecture to ensure reusability, maintainability, and scalability across multiple farm deployments.

---

## 5. Non-Functional Requirements

### 5.1 Security and Data Confidentiality
- Protect sensitive operational and financial data from unauthorized access.
- Implement encryption at rest and in transit (SSL/TLS).
- Enforce RBAC to prevent accidental or malicious data manipulation.

### 5.2 Usability
- Provide simple, intuitive interfaces designed for non-technical farm staff.
- Minimize training requirements to support high adoption rates.
- Support both desktop and mobile (PWA) access.

### 5.3 Scalability
- Support organizational growth from county-level to national and international operations.
- Handle increasing users, data volumes, and operational complexity without system redesign.
- Modular architecture to allow addition of new subsystems without disruption.

### 5.4 Reliability
- Ensure dependable daily operations with consistent, accurate data across all modules.
- Maintain data integrity and availability for both on-site and remote governance.

### 5.5 Maintainability
- Modular architecture that supports long-term updates and expansions.
- Codebase structured for independent module updates without full system redeployment.

### 5.6 Cost Efficiency
- Prioritize open-source technologies to minimize licensing costs.
- Leverage cloud-based infrastructure to reduce upfront capital expenditure.

### 5.7 Connectivity Constraints
- System must function in environments with unreliable internet connectivity (rural African contexts).
- PWA support for offline capability on the client side.

---

## 6. Performance Requirements

| Requirement | Description |
|---|---|
| **Availability** | System must be consistently available for on-site and remote users, targeting ≥99% uptime. |
| **Response Time** | Fast data retrieval and report generation; acceptable performance as data volumes grow. |
| **Concurrent Users** | Support multiple simultaneous users without performance degradation. |
| **Secure Auth Performance** | Authentication and authorization processes must be secure without causing UX delays. |
| **Growth Performance** | Maintain performance during future national and international expansion phases. |

---

## 7. System Constraints

- **Limited initial budget** — Design must be cost-effective and open-source oriented.
- **Internet dependency** — Web-based system requires reliable internet for real-time sync; rural connectivity challenges must be accommodated via offline PWA features.
- **Non-technical users** — Interfaces must be simple and require minimal training to encourage adoption by farm staff.

---

## 8. Subsystem Specifications

### 8.1 Inventory Management System (IMS)
The primary foundational subsystem. Tracks all farm inputs, outputs, feeds, and stock.

| Component | Details |
|---|---|
| Farm inputs | Seeds, fertilizers, chemicals — quantity, movement, usage per sector |
| Livestock & fish feeds | Feed quantities, movement, and feeding schedule monitoring |
| Harvested products | Finished goods, traceability from production to storage and distribution |
| Stock alerts | Automated alerts at predefined threshold levels; integrates with procurement |

### 8.2 Production Management Subsystem
Tracks all production activities across Agri-Tech's agricultural sectors.

| Component | Details |
|---|---|
| Crop production records | Planting, cultivation, harvest data; yield analysis per season and unit |
| Livestock data | Animal growth, feeding schedules, health treatments, mortality records |
| Aquaculture data | Fish stocking levels, feeding logs, harvest outputs |
| Daily production logs | Operational activity logs for traceability and accountability |

### 8.3 Human Resource & Labor Management Subsystem
Centralizes employee and contractor data, labor monitoring, and task assignment.

| Component | Details |
|---|---|
| Employee/contractor records | Personal info, role, contract details |
| Attendance & activity logs | Daily attendance records for payroll and supervision |
| Task assignments | Supervisor-assigned tasks with progress tracking |

### 8.4 Sales & Distribution Subsystem
Manages outgoing products, customer relationships, and revenue tracking.

| Component | Details |
|---|---|
| Sales transactions | Quantities, prices, dates; centralized revenue records |
| Customer records | Contact information, purchase history, contract tracking |
| Distribution logs | Product movement from storage to customers |
| Revenue summaries | Automated summaries of sales performance and income trends |

### 8.5 Asset Management Subsystem
Tracks all company-owned physical assets.

| Component | Details |
|---|---|
| Farm equipment | Ownership, usage logs, condition monitoring |
| Vehicles & tools | Daily tracking to prevent misuse and ensure availability |
| Maintenance records | Schedules, repair histories to extend asset lifespan |

### 8.6 Reporting & Decision Support Subsystem
Transforms operational data into actionable insights for management.

| Component | Details |
|---|---|
| Management dashboards | Interactive KPI dashboards for real-time operational overview |
| Performance & trend reports | Analytical reports identifying trends, inefficiencies, and gaps |
| Exportable reports | PDF and Excel exports for audits, presentations, external reporting |

---

## 9. Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React, TypeScript |
| **Mobile/PWA** | Progressive Web Application (responsive design) |
| **API Layer** | REST / GraphQL API Gateway |
| **Backend** | Node.js / Python (FastAPI or Django REST) |
| **Database** | PostgreSQL (primary relational database) |
| **Cache** | Redis (in-memory cache for performance) |
| **File Storage** | Cloud object storage (AWS S3 or GCP Cloud Storage) |
| **Auth** | JWT-based authentication + RBAC middleware |
| **Cloud Hosting** | AWS or GCP |
| **CDN** | Cloudfront (AWS) or Cloud CDN (GCP) |
| **Security** | SSL/TLS, HTTPS, encrypted data at rest |
| **Reporting** | PDF export library, Excel/CSV export |

---

## 10. Integration Strategy

All subsystems are integrated through:
1. A **shared centralized PostgreSQL database** — eliminating data duplication.
2. A **unified API layer** — standardizing communication between presentation and application layers, enforcing validation and access control.
3. **Phased integration order**: IMS → Production → HR/Assets → Sales → Reporting.

Data entered in one subsystem automatically propagates to others. For example, production entries update inventory records and are immediately available in reporting dashboards.

---

## 11. Testing & Evaluation Plan

| Test Type | Scope |
|---|---|
| **Functional Testing** | Verify each subsystem meets its specified functional requirements |
| **Integration Testing** | Validate data flow between subsystems (e.g., production updates inventory) |
| **User Acceptance Testing (UAT)** | End-user evaluation by farm supervisors, admin staff, and management |
| **Performance Testing** | Response time, concurrency, and report generation under load |
| **Security Testing** | RBAC enforcement, authentication robustness, data confidentiality |

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| System integration failures | Medium | High | Modular architecture; early integration testing |
| Schedule delays | Medium | Medium | Realistic schedule with buffer time on critical tasks |
| Cost overruns | Low | Medium | Contingency reserves; regular cost reviews |
| User adoption resistance | Medium | High | User-friendly UI; comprehensive training; clear documentation |
| Data security breach | Low | High | Authentication, RBAC, encryption, regular security audits |
| External policy/regulatory changes | Low | Medium | Flexible, scalable design; continuous external monitoring |

---

*Document version: 1.0 — Derived from Capstone I Report, Bahcesehir Cyprus University, 2026*
