# Bulk Action Platform for CRM Application

This project implements a highly scalable and efficient bulk action platform capable of performing various bulk actions on CRM entities. It is designed to be flexible, allowing for easy addition of new bulk actions. The system can handle large volumes of data with high performance, extensibility, and robust error handling.

**Demo Video:** [https://www.loom.com/share/40de7c6882ea421ebb7b09cff30d533c](https://www.loom.com/share/40de7c6882ea421ebb7b09cff30d533c)


## Features

- **Bulk Update Action**: Allows updating multiple fields for CRM entities (initially 'Contact') via CSV upload.
- **Batch Processing**: Handles updates in batches for efficiency.
- **Scalability**: Designed for horizontal scaling with a worker-based architecture using RabbitMQ.
- **Logging and Statistics**: Detailed logging for each processed entity and API endpoints for action summaries (success, failure, skipped counts).
- **API for UI Interaction**: Endpoints to display ongoing, completed, and queued actions, track real-time progress, and retrieve logs.
- **Extensible Design**: Modular architecture for easily adding new bulk actions and reusing code.
- **Rate Limiting**: Per-account rate limiting for processing entities.
- **De-duplication**: Skips duplicate entities based on the 'email' field within a bulk action.
- **Scheduling**: Ability to schedule bulk actions for future execution.

## Technical Stack

- **Backend Framework**: Node.js with Express.js
- **Database**: MongoDB (using Mongoose ODM)
- **Queuing System**: RabbitMQ (using amqplib)
- **In-memory Store**: Redis (for rate limiting and deduplication assistance)
- **CSV Parsing**: `csv-parser`
- **Validation**: Joi
- **File Uploads**: Multer
- **Scheduling**: `node-cron`

## Prerequisites

- Node.js (v18+ recommended)
- MongoDB instance running
- RabbitMQ server running
- Redis server running

## Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/aman56thakur/bulk-action-platform.git
    cd bulk-action-platform
    ```

2.  **Install dependencies:**

    ```bash
    npm i
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the root directory by copying `.env.example`.

    Adjust the URIs and other parameters as per your setup.

4.  **Create a sample CSV file:**
    Find a `sample_contacts.csv` file in the `data/` directory. Example format:
    ```csv
    id,name,email,status,age,city
    contact_id_1,Updated Name,new.email@example.com,active,,New City
    contact_id_2,Another Contact,,inactive,45,
    ```
    The `id` column should contain the `externalId` of the Contact document you want to update. Other columns are the fields and their new values. Empty values for a field mean no update for that field.

## Running the Application

```bash
npm start
```
