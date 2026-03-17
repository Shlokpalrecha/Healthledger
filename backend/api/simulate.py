"""POST /simulate endpoint"""

from fastapi import APIRouter
from api.schemas import HealthInputs
from models.risk_model import risk_models
from simulation.monte_carlo import run_simulation

router = APIRouter()


@router.post("/simulate")
def simulate(inputs: HealthInputs):
    data = inputs.model_dump()
    base_probs = risk_models.predict(data)
    result = run_simulation(base_probs, data)
    return result
