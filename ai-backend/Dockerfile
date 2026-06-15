# Use a lightweight Python image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose port 7860 (required by Hugging Face Spaces)
EXPOSE 7860

# Command to run the FastAPI app
# Note: --host 0.0.0.0 is required for external access
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]