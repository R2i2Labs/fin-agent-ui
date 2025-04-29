from prompts import SCRIPT_GENERATION_TEMPLATE

def generate_script(agent, user_query, dataset_path, conversation_id):
    """Generate a standalone Python script based on user's natural language query."""      
    prompt = SCRIPT_GENERATION_TEMPLATE.format(
        data_file=agent.data_file,
        dataset_path=dataset_path,
        shape=agent.data.shape,
        columns=', '.join(agent.data.columns),
        dtypes=dict(agent.data.dtypes.head().astype(str)),
        user_query=user_query,
        conversation_id=conversation_id
    )
    
    try:
        response = agent.client.responses.create(
            model=agent.model,
            input=[{"role": "user", "content": prompt}],
            max_output_tokens=1000
        )
        output_text = response.output_text
        if "PACKAGES:" in output_text:
            packages_line = output_text.split("PACKAGES:")[1].split("\n")[0].strip()
            packages = [pkg.strip() for pkg in packages_line.split(",")]
            
            # Remove the packages line from the script
            script = output_text.replace(f"PACKAGES: {packages_line}\n", "").strip()
            
            return {"script": script, "packages": packages}
        else:
            # Default packages if none specified
            return {"script": output_text, "packages": ["numpy", "pandas", "matplotlib"]}
    
    except Exception as e:
        print(f"Error generating script: {e}")
        return None