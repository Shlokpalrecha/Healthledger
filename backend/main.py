"""
HealthLedger AI — FastAPI Backend Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.predict import router as predict_router
from api.simulate import router as simulate_router
from api.explain import router as explain_router

app = FastAPI(
    title="HealthLedger AI",
    description="Health Risk Intelligence Engine with Monte Carlo Simulation",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict_router)
app.include_router(simulate_router)
app.include_router(explain_router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "HealthLedger AI"}
