from langchain.tools import ToolRuntime, tool
from langchain.agents import create_agent, AgentState
from langchain.chat_models import init_chat_model

model= init_chat_model(model='gpt-5-nano')

class CustomState(AgentState):
    user_name: str

@tool
def greet_user(runtime: ToolRuntime[CustomState],) -> str:
    """Greet the user by name."""
    user_name = runtime.state.get("user_name", None)
    return f"The user name is: {user_name}!"

personal_chef_prompt = """
    You are a personal chef assistant. 
    Your task is to provide personalized meal recommendations based on user 
    Ingredients and preferences.
    Greet the user personally by his name.
"""

# Putting it all together
memory = create_agent(
    model=model,
    system_prompt=personal_chef_prompt,
    tools=[greet_user],
    state_schema=CustomState,
)
