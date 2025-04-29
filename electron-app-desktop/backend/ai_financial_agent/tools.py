import os
import subprocess
import sys


class Tools:
    def __init__(self, agent):
        self.agent = agent
    
    def get_tools(self):
        """Return the list of available tools."""
        return [
            {
                "type": "function",
                "name": "get_dataset_list",
                "description": "List all available CSV datasets in the datasets directory",
                "strict": True,
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": False
                }
            },
            {
                "type": "function",
                "name": "load_dataset",
                "description": "Load a specific dataset by filename",
                "strict": True,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "filename": {
                            "type": "string",
                            "description": "The name of the CSV file to load"
                        }
                    },
                    "required": ["filename"],
                    "additionalProperties": False
                }
            },
            {
                "type": "function",
                "name": "get_data_preview",
                "description": "Get a preview of the currently loaded dataset",
                "strict": True,
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": False
                }
            },
            {
                "type": "function",
                "name": "get_data_info",
                "description": "Get detailed information about the currently loaded dataset",
                "strict": True,
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": False
                }
            },
            {
                "type": "function",
                "name": "run_script",
                "description": "Generate and execute Python code to analyze the dataset based on user request",
                "strict": True,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "analysis_request": {
                            "type": "string",
                            "description": "The user's natural language request for what analysis to perform"
                        }
                    },
                    "required": ["analysis_request"],
                    "additionalProperties": False
                }
            }
        ]
    
    def call_function(self, tool_name, tool_args, conversation_id):
        """Call the appropriate function based on tool name."""
        if tool_name == "get_dataset_list":
            return self.get_dataset_list(**tool_args)
        elif tool_name == "load_dataset":
            return self.load_dataset(**tool_args)
        elif tool_name == "get_data_preview":
            return self.get_data_preview(**tool_args)
        elif tool_name == "get_data_info":
            return self.get_data_info(**tool_args)
        elif tool_name == "run_script":
            tool_output = self.run_script(**tool_args, conversation_id=conversation_id)
            if tool_output.get("status") == "success" and "output" in tool_output:
                # Don't send full results back to the AI model
                # Just return minimal information about script execution
                return {
                    "status": "executed",
                    "message": tool_output.get("output")
                }
            
            return tool_output
        
        return {"status": "error", "message": f"Unknown tool: {tool_name}"}
    
    def get_dataset_list(self):
        """List all CSV files in the datasets directory."""
        dataset_dir = "datasets"
        if not os.path.exists(dataset_dir):
            return {"status": "error", "message": f"Directory '{dataset_dir}' not found!"}
        
        files = [f for f in os.listdir(dataset_dir) if f.endswith('.csv')]
        if not files:
            return {"status": "empty", "message": "No CSV files found in the 'datasets' directory."}
        
        return {"status": "success", "datasets": files}
    
    def load_dataset(self, filename):
        """Load a dataset from the datasets directory."""
        file_path = os.path.join("datasets", filename)
        if not os.path.exists(file_path):
            return {"status": "error", "message": f"File '{file_path}' not found!"}
        
        try:
            self.agent.data = self.agent.analyzer.load_data(file_path)
            self.agent.data_file = filename
            
            info = {
                "status": "success",
                "filename": filename,
                "shape": self.agent.data.shape,
                "columns": list(self.agent.data.columns),
                "preview": self.agent.data.head(10).to_dict(orient="records")
            }
            return info
        except Exception as e:
            return {"status": "error", "message": f"Error loading dataset: {str(e)}"}
    
    def get_data_preview(self):
        """Display a preview of the loaded data."""
        if self.agent.data is None:
            return {"status": "error", "message": "No dataset loaded yet."}
        
        return {
            "status": "success", 
            "filename": self.agent.data_file,
            "preview": self.agent.data.head().to_dict(orient="records")
        }
    
    def get_data_info(self):
        """Get information about the loaded dataset."""
        if self.agent.data is None:
            return {"status": "error", "message": "No dataset loaded yet."}
        
        import json
        info = {
            "status": "success",
            "filename": self.agent.data_file,
            "shape": self.agent.data.shape,
            "columns": list(self.agent.data.columns),
            "dtypes": {col: str(dtype) for col, dtype in zip(self.agent.data.dtypes.index, self.agent.data.dtypes.values)},
            "summary": json.loads(self.agent.data.describe().to_json())
        }
        return info
    
    def run_script(self, analysis_request, conversation_id):
        """Generate a standalone Python script based on the analysis request and identify required packages."""
        if self.agent.data is None:
            return {"status": "error", "message": "No dataset loaded. Please load a dataset first."}
        
        # Get dataset info for the script
        dataset_path = os.path.join("datasets", self.agent.data_file)
        
        # Generate the standalone script and required packages
        script_info = self._generate_standalone_script(analysis_request, dataset_path, conversation_id)
        if not script_info or not script_info.get('script'):
            return {"status": "error", "message": "Failed to generate analysis script."}
        
        script = script_info['script']
        required_packages = script_info.get('packages', ['numpy', 'pandas', 'matplotlib'])
        
        # Clean up script to remove triple backticks and other markdown formatting
        script = self._clean_script(script)
        
        # Create directories for scripts and requirements
        os.makedirs("generated_scripts", exist_ok=True)
        
        # Save the script to a temporary file for execution
        script_path = os.path.join("generated_scripts", "analysis_script.py")
        with open(script_path, "w") as f:
            f.write(script)
        
        # Save required packages to a requirements file
        requirements_path = os.path.join("generated_scripts", "script_requirements.txt")
        with open(requirements_path, "w") as f:
            for package in required_packages:
                f.write(f"{package}\n")
        
        # Execute the script in a temporary environment
        execution_result = self.execute_standalone_script(script_path, requirements_path)
        return {
            "status": "success" if execution_result.get("status") == "success" else "error",
            "script": script,
            "required_packages": required_packages,
            "script_path": script_path,
            "requirements_path": requirements_path,
            "execution_result": execution_result,
            "message": execution_result.get("message", "Script execution complete.")
        }

    def _generate_standalone_script(self, user_query, dataset_path, conversation_id):
        """Generate a standalone Python script based on user's natural language query."""
        from ai_financial_agent.script_generator import generate_script
        generated_script = generate_script(self.agent, user_query, dataset_path, conversation_id)
        return generated_script
        
    def _clean_script(self, script):
        """Clean the script by removing markdown code blocks and other formatting."""
        # Remove triple backticks and python marker if present
        script = script.replace("```python", "").replace("```", "").strip()
        return script

    def execute_standalone_script(self, script_path, requirements_path):
        """Execute a script in a temporary virtual environment with required packages installed."""
        import tempfile
        import venv
        
        print("\n" + "="*50)
        print(f"Setting up virtual environment and executing: {script_path}")
        print("="*50)
        
        # Create a temporary directory for the virtual environment
        with tempfile.TemporaryDirectory() as venv_dir:
            try:
                # Create a virtual environment
                print(f"Creating virtual environment in {venv_dir}...")
                venv.create(venv_dir, with_pip=True)
                
                # Determine the path to the Python interpreter in the virtual environment
                if os.name == 'nt':  # Windows
                    python_path = os.path.join(venv_dir, 'Scripts', 'python.exe')
                else:  # Unix/MacOS
                    python_path = os.path.join(venv_dir, 'bin', 'python')
                
                # Install required packages
                print(f"Installing required packages from {requirements_path}...")
                subprocess.run(
                    [python_path, '-m', 'pip', 'install', '-r', requirements_path],
                    capture_output=True,
                    text=True,
                    check=True
                )
                
                # Execute the script
                print(f"Executing script...")
                result = subprocess.run(
                    [python_path, script_path],
                    capture_output=True,
                    text=True
                )
                
                if result.returncode == 0:
                    # Script executed successfully
                    print("\nAnalysis Results:")
                    print("-"*50)
                    print(result.stdout)
                    return {"status": "success", "output": result.stdout, "message": "Script executed successfully"}
                else:
                    # Script execution failed
                    print("\nError executing script:")
                    print("-"*50)
                    print(result.stderr)
                    return {"status": "error", "output": result.stderr, "message": f"Script execution failed: {result.stderr}"}
                    
            except subprocess.CalledProcessError as e:
                print(f"\nError installing packages: {e.stderr}")
                return {"status": "error", "message": f"Failed to install required packages: {e.stderr}"}
            except Exception as e:
                print(f"\nError: {str(e)}")
                return {"status": "error", "message": f"Failed to execute script: {str(e)}"}
            
    def execute_script_in_persistent_venv(self, script_path, requirements_path, venv_dir=None):
        """Execute a script in a persistent virtual environment with required packages installed."""
        import venv
        
        print("\n" + "="*50)
        print(f"Setting up virtual environment and executing: {script_path}")
        print("="*50)
        
        # If no venv directory is specified, create one in the same directory as the script
        if venv_dir is None:
            script_directory = os.path.dirname(os.path.abspath(script_path))
            venv_dir = os.path.join(script_directory, "script_venv")
        
        try:
            # Create a virtual environment if it doesn't exist
            if not os.path.exists(venv_dir):
                print(f"Creating virtual environment in {venv_dir}...")
                venv.create(venv_dir, with_pip=True)
            else:
                print(f"Using existing virtual environment in {venv_dir}")
            
            # Determine the path to the Python interpreter in the virtual environment
            if os.name == 'nt':  # Windows
                python_path = os.path.join(venv_dir, 'Scripts', 'python.exe')
            else:  # Unix/MacOS
                python_path = os.path.join(venv_dir, 'bin', 'python')
            
            # Install required packages
            print(f"Installing required packages from {requirements_path}...")
            subprocess.run(
                [python_path, '-m', 'pip', 'install', '-r', requirements_path],
                capture_output=True,
                text=True,
                check=True
            )
            
            # Execute the script
            print(f"Executing script...")
            result = subprocess.run(
                [python_path, script_path],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                # Script executed successfully
                print("\nAnalysis Results:")
                print("-"*50)
                print(result.stdout)
                return {"status": "success", "output": result.stdout, "message": "Script executed successfully"}
            else:
                # Script execution failed
                print("\nError executing script:")
                print("-"*50)
                print(result.stderr)
                return {"status": "error", "output": result.stderr, "message": f"Script execution failed: {result.stderr}"}
                    
        except subprocess.CalledProcessError as e:
            print(f"\nError installing packages: {e.stderr}")
            return {"status": "error", "message": f"Failed to install required packages: {e.stderr}"}
        except Exception as e:
            print(f"\nError: {str(e)}")
            return {"status": "error", "message": f"Failed to execute script: {str(e)}"}