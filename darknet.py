import subprocess
import sys
import os
import signal

def serve():
    print("====================================================")
    print("🛡️  Starting Darknet Monitor Command Center Services...")
    print("====================================================")
    
    root_dir = os.getcwd()
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")
    
    # 1. Resolve Python path in virtual environment
    venv_python_win = os.path.join(backend_dir, ".venv", "Scripts", "python.exe")
    venv_python_unix = os.path.join(backend_dir, ".venv", "bin", "python")
    
    if os.path.exists(venv_python_win):
        python_cmd = venv_python_win
    elif os.path.exists(venv_python_unix):
        python_cmd = venv_python_unix
    else:
        python_cmd = "python3" if sys.platform != "win32" else "python"
    
    # 2. Start backend
    print(f"⚙️  Starting FastAPI Backend using: {python_cmd}")
    backend_proc = subprocess.Popen(
        [python_cmd, "run.py"],
        cwd=backend_dir
    )
    
    # Wait for backend to bind to port 8000 before starting frontend
    import socket
    import time
    print("⏳ Waiting for FastAPI Backend to boot up...")
    timeout = 30
    start_time = time.time()
    backend_ready = False
    
    while time.time() - start_time < timeout:
        # Check if backend process died early
        if backend_proc.poll() is not None:
            print("❌ Backend failed to start.")
            break
        try:
            with socket.create_connection(("127.0.0.1", 8000), timeout=1):
                backend_ready = True
                break
        except OSError:
            time.sleep(0.5)
            
    if backend_ready:
        print("✅ Backend is online!")
    else:
        print("⚠ Backend startup timed out, starting frontend anyway...")

    # 3. Start frontend
    print("⚡ Starting Vite Frontend...")
    frontend_proc = subprocess.Popen(
        "npm run dev",
        cwd=frontend_dir,
        shell=True
    )
    
    print("\n🚀 Both services are running concurrently!")
    print("   • Backend API: http://localhost:8000")
    print("   • Frontend Dashboard: http://localhost:5173")
    print("   Press [Ctrl + C] to terminate both services.\n")
    
    try:
        # Keep orchestrator running and wait for sub-processes
        while True:
            # Check if any process terminated early
            back_exit = backend_proc.poll()
            front_exit = frontend_proc.poll()
            
            if back_exit is not None:
                print(f"\n⚠ Backend terminated unexpectedly with exit code {back_exit}")
                break
            if front_exit is not None:
                print(f"\n⚠ Frontend terminated unexpectedly with exit code {front_exit}")
                break
                
            # Sleep briefly to free up CPU
            import time
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\nStopping services...")
    finally:
        # Terminate processes cleanly
        try:
            backend_proc.terminate()
            backend_proc.wait(timeout=2)
        except Exception:
            pass
            
        try:
            frontend_proc.terminate()
            frontend_proc.wait(timeout=2)
        except Exception:
            pass
            
        print("✓ Stopped all Darknet Monitor services.")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        serve()
    else:
        print("Usage: darknet serve")
