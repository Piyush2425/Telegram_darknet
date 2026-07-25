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
    venv_python = os.path.join(backend_dir, ".venv", "Scripts", "python.exe")
    python_cmd = venv_python if os.path.exists(venv_python) else "python"
    
    # 2. Start backend
    print(f"⚙️  Starting FastAPI Backend using: {python_cmd}")
    backend_proc = subprocess.Popen(
        [python_cmd, "run.py"],
        cwd=backend_dir
    )
    
    # 3. Start frontend
    print("⚡ Starting Vite Frontend...")
    frontend_proc = subprocess.Popen(
        ["npm", "run", "dev"],
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
