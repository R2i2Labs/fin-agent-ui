from enum import Enum
import os
import logging
import shutil
from typing import Dict, List, Optional, Union
from fastapi import FastAPI, File, Form, HTTPException, Depends, Path, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import json

from ai_financial_agent.agent import AIFinancialAgent
from dotenv import load_dotenv
from db.sqlite import DatabaseManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Create logger
logger = logging.getLogger("ai_financial_api")

load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="AI Financial Agent API",
    description="API for analyzing financial datasets using AI",
    version="1.0.0"
)

# Add CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
_agent = None
db_manager = DatabaseManager()

class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    message_type: str
    content: str
    role: Optional[str] = None
    call_id: Optional[str] = None
    function_name: Optional[str] = None
    timestamp: str
    extra_data: Optional[str] = None

class ConversationResponse(BaseModel):
    id: int
    name: str
    agent_id: str
    messages: Optional[List[MessageResponse]]
    created_at: str
    last_updated: str

class ConversationListResponse(BaseModel):
    conversations: List[ConversationResponse]

class ConversationCreateResponse(BaseModel):
    conversation_id: int
    status: str
    message: str

class ConversationDeleteResponse(BaseModel):
    status: str
    message: str
    
class AgentsEnum(Enum):
    FINANCE = "finance"
    
class ConversationRequest(BaseModel):
    name: str
    agent_id: AgentsEnum

def get_agent(conversation_id: Optional[int] = None):
    global _agent
    if _agent is None:
        logger.info("Creating new agent instance")
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.error("OPENAI_API_KEY environment variable not found")
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY environment variable not found")
        
        _agent = AIFinancialAgent(api_key)
    
    # If conversation_id is provided, load the conversation history
    if conversation_id:
        logger.debug(f"Loading conversation history for ID: {conversation_id}")
        conversation = db_manager.get_conversation(conversation_id)
        if not conversation:
            logger.warning(f"Conversation with ID {conversation_id} not found")
            raise HTTPException(status_code=404, detail=f"Conversation with ID {conversation_id} not found")
        
        # Clear existing messages and load from DB
        _agent.messages = []
        messages = db_manager.get_messages_for_openai(conversation_id)
        _agent.messages.extend(messages)
        logger.debug(f"Loaded conversation messages: {messages}")
        
        logger.info(f"Loaded {len(messages)} messages from conversation {conversation_id}")
    
    return _agent

# Pydantic models for request/response validation
class DatasetListResponse(BaseModel):
    status: str
    datasets: Optional[List[str]] = None
    message: Optional[str] = None

class LoadDatasetRequest(BaseModel):
    filename: str

class DatasetResponse(BaseModel):
    status: str
    filename: Optional[str] = None
    shape: Optional[tuple] = None
    columns: Optional[List[str]] = None
    preview: Optional[List[Dict]] = None
    message: Optional[str] = None

class DataInfoResponse(BaseModel):
    status: str
    filename: Optional[str] = None
    shape: Optional[tuple] = None
    columns: Optional[List[str]] = None
    dtypes: Optional[Dict[str, str]] = None
    summary: Optional[Dict] = None
    message: Optional[str] = None

class RunScriptRequest(BaseModel):
    analysis_request: str

class RunScriptResponse(BaseModel):
    status: str
    script: Optional[str] = None
    required_packages: Optional[List[str]] = None
    output: Optional[str] = None
    message: Optional[str] = None

class QueryRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    response: str
    tool_results: Optional[List[Dict]] = None
    conversation_id: int
    extra_data: Optional[str]

class FileUploadResponse(BaseModel):
    status: str
    filename: str
    message: str

# API Endpoints
@app.get("/")
def read_root():
    logger.info("Root endpoint accessed")
    return {"message": "Welcome to the AI Financial Agent API"}


@app.post("/file-upload", response_model=FileUploadResponse)
async def upload_dataset(file: UploadFile = File(...)):
    """Upload a CSV dataset file to the datasets directory"""
    logger.info(f"Processing file upload: {file.filename}")
    
    # Validate file extension
    if not file.filename.endswith('.csv'):
        logger.error(f"Invalid file type: {file.filename}")
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    
    # Get the current working directory
    current_dir = os.getcwd()
    logger.info(f"Current working directory: {current_dir}")
    
    # Create datasets directory path
    try:
        # Try with absolute path first
        datasets_dir = os.path.join(current_dir, "datasets")
        logger.info(f"Creating datasets directory at: {datasets_dir}")
        
        # Ensure datasets directory exists
        os.makedirs(datasets_dir, exist_ok=True)
    except Exception as e:
        error_msg = f"Failed to create datasets directory: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    
    # Create safe filename (avoid directory traversal)
    safe_filename = os.path.basename(file.filename)
    file_path = os.path.join(datasets_dir, safe_filename)
    
    try:
        # Save the file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"File uploaded successfully: {safe_filename}")
        
        return {
            "status": "success",
            "filename": safe_filename,
            "message": f"File '{safe_filename}' uploaded successfully to datasets directory"
        }
    
    except Exception as e:
        error_msg = f"Error uploading file: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    finally:
        # Close the file
        file.file.close()

@app.get("/datasets", response_model=DatasetListResponse)
def get_datasets(agent: AIFinancialAgent = Depends(get_agent)):
    logger.info("Getting dataset list")
    result = agent.tools_manager.get_dataset_list()
    return result

@app.post("/datasets/load", response_model=DatasetResponse)
def load_dataset(request: LoadDatasetRequest, agent: AIFinancialAgent = Depends(get_agent)):
    logger.info(f"Loading dataset: {request.filename}")
    result = agent.tools_manager.load_dataset(filename=request.filename)
    if result["status"] == "success":
        logger.info(f"Dataset {request.filename} loaded successfully")
    else:
        logger.error(f"Failed to load dataset {request.filename}: {result.get('message')}")
    return result

@app.get("/data/preview", response_model=DatasetResponse)
def get_data_preview(agent: AIFinancialAgent = Depends(get_agent)):
    logger.info("Requesting data preview")
    result = agent.tools_manager.get_data_preview()
    return result

@app.get("/data/info", response_model=DataInfoResponse)
def get_data_info(agent: AIFinancialAgent = Depends(get_agent)):
    logger.info("Requesting data info")
    result = agent.tools_manager.get_data_info()
    return result

@app.get("/agents")
def get_agents():
    logger.info("Getting available agents")
    return [{'agent_id':AgentsEnum.FINANCE, 'name':"Financial Agent", 'storage': True}]

@app.get("/status")
def get_status():
    logger.debug("Status check endpoint accessed")
    return {"status":"ok"}

@app.get("/reset")
def reset_agent():
    global _agent
    logger.info("Resetting agent")
    if _agent is not None:
        del _agent
    _agent = None
    return {"status":"ok"}

@app.post("/analyze", response_model=RunScriptResponse)
def run_analysis_script(request: RunScriptRequest, agent: AIFinancialAgent = Depends(get_agent)):
    logger.info(f"Running analysis script with request: '{request.analysis_request[:50]}...'")
    result = agent.tools_manager.run_script(analysis_request=request.analysis_request)
    
    # Extract only the necessary information for the API response
    response = {
        "status": result.get("status", "error"),
        "script": result.get("script"),
        "required_packages": result.get("required_packages"),
        "message": result.get("message")
    }
    
    # Add output if available
    if "execution_result" in result and "output" in result["execution_result"]:
        response["output"] = result["execution_result"]["output"]
    
    if response["status"] == "error":
        logger.error(f"Analysis script execution failed: {response.get('message')}")
    else:
        logger.info("Analysis script executed successfully")
    
    return response

@app.post("/{agent_id}/conversations", response_model=ConversationCreateResponse)
def create_conversation(
    agent_id: str,
    request: ConversationRequest
):
    logger.info(f"Creating new conversation with name: {request.name}")
    conversation_id = db_manager.create_conversation(request.name, agent_id)
    logger.info(f"Created conversation with ID: {conversation_id}")
    return {
        "conversation_id": conversation_id,
        "status": "success",
        "message": f"Created new conversation with ID {conversation_id}"
    }

@app.get("/{agent_id}/conversations", response_model=ConversationListResponse)
def list_conversations(agent_id: str):
    logger.info(f"Listing conversations for agent: {agent_id}")
    conversations = db_manager.list_conversations(agent_id)
    logger.debug(f"Found {len(conversations)} conversations")
    return {"conversations": conversations}

@app.get("/{agent_id}/conversations/{conversation_id}", response_model=ConversationResponse)
def get_conversation(conversation_id: int):
    logger.info(f"Getting conversation with ID: {conversation_id}")
    conversation = db_manager.get_conversation(conversation_id)
    if not conversation:
        logger.warning(f"Conversation with ID {conversation_id} not found")
        raise HTTPException(status_code=404, detail=f"Conversation with ID {conversation_id} not found")
    
    # Fetch messages for this conversation
    messages = db_manager.get_messages_for_conversation(conversation_id)
    logger.debug(f"Found {len(messages)} messages in conversation {conversation_id}")
    
    # Add messages to the conversation response
    conversation["messages"] = messages
    return conversation

@app.delete("/{agent_id}/conversations/{conversation_id}", response_model=ConversationDeleteResponse)
def delete_conversation(conversation_id: int):
    logger.info(f"Deleting conversation with ID: {conversation_id}")
    if not db_manager.delete_conversation(conversation_id):
        logger.warning(f"Attempt to delete non-existent conversation ID: {conversation_id}")
        raise HTTPException(status_code=404, detail=f"Conversation with ID {conversation_id} not found")
    logger.info(f"Successfully deleted conversation ID: {conversation_id}")
    return {
        "status": "success",
        "message": f"Deleted conversation with ID {conversation_id}"
    }

@app.post("/{agent_id}/query", response_model=QueryResponse)
async def query_agent(
    agent_id: str,
    request: QueryRequest, 
    conversation_id: Optional[int] = Query(None),
    agent: AIFinancialAgent = Depends(get_agent)
):
    """Process a natural language query to the agent"""
    # Create a new conversation if none is specified
    if conversation_id is None:
        # Create new conversation with a truncated name
        conversation_name = request.query[:30] + "..." if len(request.query) > 30 else request.query
        logger.info(f"Creating new conversation with name: {conversation_name}")
        conversation_id = db_manager.create_conversation(conversation_name, agent_id)
        logger.info(f"Created new conversation with ID: {conversation_id}")
        # Get a fresh agent (don't call reset_agent() here since we need the agent from dependency)
        agent.messages = []
    else:
        logger.info(f"Using existing conversation ID: {conversation_id}")
    
    # Save the user message to DB (agent will add it to its own state)
    user_message = {
        "type": "message",
        "role": "user",
        "content": request.query
    }
    logger.debug(f"Saving user message to conversation {conversation_id}: {request.query[:50]}...")
    db_manager.save_message(conversation_id, user_message)
    
    # Process the user query
    logger.info(f"Processing user query: {request.query[:50]}...")
    agent_response = agent.process_user_input(request.query)
    
    # Handle tool calls if needed
    tool_results = []
    max_tool_calls = 5  # Safeguard against infinite loops
    tool_call_count = 0
    
    while agent_response.get('needs_tool_call', False) and tool_call_count < max_tool_calls:
        tool_call_count += 1
        logger.info(f"Processing tool call {tool_call_count}/{max_tool_calls}")
        
        if agent_response.get('final_tool_calls'):
            for index in agent_response['final_tool_calls']:
                tool_call = agent_response['final_tool_calls'][index]
                if tool_call.type != "function_call":
                    continue
                
                # Save tool call to database
                tool_call_data = {
                    "type": "function_call",
                    "call_id": tool_call.call_id,
                    "name": tool_call.name,
                    "arguments": tool_call.arguments
                }
                logger.debug(f"Saving tool call to DB: {tool_call.name}")
                db_manager.save_message(conversation_id, tool_call_data)
                agent.messages.append(tool_call)
                
                # Extract tool details
                name = tool_call.name
                args = json.loads(tool_call.arguments)
                logger.info(f"Executing tool: {name} with args: {json.dumps(args)[:100]}...")

                # Call the function
                result = agent.call_function(name, args, conversation_id)
                logger.debug(f"Tool {name} execution successful")
                
                # Store the result for response
                tool_results.append({
                    "tool": name,
                    "arguments": args,
                    "result": result
                })
                
                # Create tool result message
                tool_result_message = {
                    "type": "function_call_output",
                    "call_id": tool_call.call_id,
                    "output": json.dumps(result)
                }
                
                # Save tool result to database
                logger.debug(f"Saving tool result to DB for call ID: {tool_call.call_id}")
                db_manager.save_message(conversation_id, tool_result_message)
                agent.messages.append({
                    "type": "function_call_output",
                    "call_id": tool_call.call_id,
                    "output": str(result)
                })
        
        # Process tool response
        logger.info("Handling tool response")
        agent_response = agent.handle_tool_response()
        logger.debug(f"Tool response handled. Needs another call: {agent_response.get('needs_tool_call', False)}")
    
    # Check if we hit the limit
    if tool_call_count >= max_tool_calls:
        logger.warning(f"Maximum tool call limit ({max_tool_calls}) reached in conversation {conversation_id}!")
        
    # Save final assistant response with token usage data
    if "output_text" in agent_response:
        final_message = {
            "type": "message",
            "role": "assistant",
            "content": agent_response["output_text"],
            "extra_data": json.dumps(agent_response.get("token_usage", {})) if agent_response.get("token_usage") else None
        }
        logger.debug(f"Saving assistant response to DB: {agent_response['output_text'][:50]}...")
        db_manager.save_message(conversation_id, final_message)
    else:
        logger.warning("No output text in agent response")
    
    # Return the final response along with any tool results and conversation ID
    logger.info(f"Query processing complete for conversation {conversation_id}")
    
    logger.info(agent_response.get("token_usage", None))
    return {
        "response": agent_response.get("output_text", "No response generated"),
        "tool_results": tool_results if tool_results else None,
        "conversation_id": conversation_id,
        "extra_data": json.dumps(agent_response.get("token_usage", None)) 
    }
    
os.makedirs("generated_assets", exist_ok=True)
app.mount("/static", StaticFiles(directory="generated_assets"), name="static")

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting uvicorn server")
    uvicorn.run(app, host="0.0.0.0", port=8000)