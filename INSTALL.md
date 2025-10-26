# Installation

This document provides instructions on how to install and run the Jupyter-ish application.

## Prerequisites

- Python 3.8 or higher
- `git` for cloning the repository

## Installation Steps

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Create and activate a virtual environment:**

    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  **Install Python dependencies:**

    ```bash
    pip install -r requirements.txt
    ```

4.  **Download vendor JavaScript files:**

    The application requires some third-party JavaScript libraries for rendering Markdown and DOT graphs.

    ```bash
    mkdir -p static/vendor
    cd static/vendor

    # Viz.js (for DOT rendering)
    curl -fsSL -o viz.js https://unpkg.com/viz.js@2.1.2/viz.js
    curl -fsSL -o render.full.js https://unpkg.com/viz.js@2.1.2/full.render.js

    # marked.js (for Markdown rendering)
    curl -fsSL -o marked.min.js https://cdn.jsdelivr.net/npm/marked@5/marked.min.js

    cd ../..
    ```

## Running the Application

Once the installation is complete, you can run the application using `uvicorn`:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then, open your web browser and navigate to `http://127.0.0.1:8000`.
