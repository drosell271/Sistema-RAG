# Backend API (Node.js)

The central orchestrator of the RAG Platform. Built with **Express** and **TypeScript**.

## 🛠 Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Express
- **Database**: Mongoose (MongoDB)
- **Task Queue**: Celery (via Redis) to communicate with Python Worker.
- **Logging**: Winston

## 🔑 Key Features

- **Auth**: JWT Authentication with `bcrypt` hashing.
- **Auto-Configuration**:
    - **Initial Admin**: Creates a default admin on startup if missing (credentials in `.env`).
    - **Dynamic Settings**: Loads `CHUNK_SIZE`, `OVERLAP`, etc., from MongoDB. Uses `.env` defaults if DB is empty.
- **Security**:
    - Admin Domain restriction (`ADMIN_DOMAIN`).
    - Configurable Password Hashing (`BCRYPT_ROUNDS`).
    - Upload Limits (`MAX_FILE_SIZE_MB`).

## ⚙️ Configuration (Environment Variables)

See `.env.example` for full list.

| Variable | Description | Default |
|T---|---|---|
| `ADMIN_EMAIL` | Email for initial admin | `admin@example.com` |
| `ADMIN_DOMAIN` | Recommended. Restricts admin creation to this domain | _(Optional)_ |
| `MAX_FILE_SIZE_MB` | Max upload size | `50` |
| `LOG_LEVEL` | Logging verbosity (`info`, `debug`, `warn`) | `info` |

## 🚀 Development

```bash
cd backend
npm install
npm run dev
```
