import os
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

load_dotenv()

cred = credentials.Certificate(
    os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
)
firebase_admin.initialize_app(cred)
db = firestore.client()

JUNCTIONS = [
    {"junction_id": "BHU001", "name": "Master Canteen Square",      "city": "bhubaneswar", "tier": "tier1", "lat": 20.2961, "lng": 85.8245},
    {"junction_id": "BHU002", "name": "Rasulgarh Square",           "city": "bhubaneswar", "tier": "tier1", "lat": 20.2812, "lng": 85.8394},
    {"junction_id": "BHU003", "name": "Vani Vihar Square",          "city": "bhubaneswar", "tier": "tier1", "lat": 20.2985, "lng": 85.8146},
    {"junction_id": "BHU004", "name": "Patia Square",               "city": "bhubaneswar", "tier": "tier1", "lat": 20.3543, "lng": 85.8193},
    {"junction_id": "BHU005", "name": "Jaydev Vihar Square",        "city": "bhubaneswar", "tier": "tier1", "lat": 20.2976, "lng": 85.8018},
    {"junction_id": "BHU006", "name": "Kalpana Square",             "city": "bhubaneswar", "tier": "tier1", "lat": 20.2718, "lng": 85.8414},
    {"junction_id": "BHU007", "name": "Airport Square",             "city": "bhubaneswar", "tier": "tier1", "lat": 20.2441, "lng": 85.8177},
    {"junction_id": "BHU008", "name": "KIIT Square",                "city": "bhubaneswar", "tier": "tier1", "lat": 20.3523, "lng": 85.8194},
    {"junction_id": "BHU009", "name": "Infocity Square",            "city": "bhubaneswar", "tier": "tier1", "lat": 20.3467, "lng": 85.8162},
    {"junction_id": "BHU010", "name": "Nandankanan Square",         "city": "bhubaneswar", "tier": "tier1", "lat": 20.3986, "lng": 85.8171},
    {"junction_id": "BHU011", "name": "VSS Nagar Square",           "city": "bhubaneswar", "tier": "tier1", "lat": 20.2893, "lng": 85.8336},
    {"junction_id": "BHU012", "name": "Saheed Nagar Square",        "city": "bhubaneswar", "tier": "tier1", "lat": 20.2956, "lng": 85.8412},
    {"junction_id": "BHU013", "name": "Bomikhal Square",            "city": "bhubaneswar", "tier": "tier1", "lat": 20.2833, "lng": 85.8476},
    {"junction_id": "BHU014", "name": "Ram Mandir Square",          "city": "bhubaneswar", "tier": "tier1", "lat": 20.2657, "lng": 85.8351},
    {"junction_id": "BHU015", "name": "Bapuji Nagar Square",        "city": "bhubaneswar", "tier": "tier1", "lat": 20.2601, "lng": 85.8302},
    {"junction_id": "BHU016", "name": "Unit 4 Square",              "city": "bhubaneswar", "tier": "tier1", "lat": 20.2788, "lng": 85.8311},
    {"junction_id": "BHU017", "name": "Rajmahal Square",            "city": "bhubaneswar", "tier": "tier1", "lat": 20.2714, "lng": 85.8261},
    {"junction_id": "BHU018", "name": "Damana Square",              "city": "bhubaneswar", "tier": "tier1", "lat": 20.3312, "lng": 85.8198},
    {"junction_id": "BHU019", "name": "Chandrasekharpur Square",    "city": "bhubaneswar", "tier": "tier1", "lat": 20.3198, "lng": 85.8134},
    {"junction_id": "BHU020", "name": "Nageswar Tangi Square",      "city": "bhubaneswar", "tier": "tier1", "lat": 20.3089, "lng": 85.8221},
]

# Edges: (from, to, base_time_sec)
# base_time_sec = realistic driving time between adjacent junctions
EDGES = [
    # Central corridor
    ("BHU001", "BHU011", 150), ("BHU011", "BHU001", 150),
    ("BHU001", "BHU003", 180), ("BHU003", "BHU001", 180),
    ("BHU001", "BHU012", 200), ("BHU012", "BHU001", 200),
    ("BHU001", "BHU016", 210), ("BHU016", "BHU001", 210),

    # North corridor (towards KIIT, Patia, Infocity)
    ("BHU001", "BHU020", 240), ("BHU020", "BHU001", 240),
    ("BHU020", "BHU019", 180), ("BHU019", "BHU020", 180),
    ("BHU019", "BHU018", 200), ("BHU018", "BHU019", 200),
    ("BHU018", "BHU009", 210), ("BHU009", "BHU018", 210),
    ("BHU009", "BHU008", 120), ("BHU008", "BHU009", 120),
    ("BHU008", "BHU004", 90),  ("BHU004", "BHU008", 90),
    ("BHU004", "BHU010", 480), ("BHU010", "BHU004", 480),

    # East corridor (towards Rasulgarh, Bomikhal)
    ("BHU001", "BHU002", 240), ("BHU002", "BHU001", 240),
    ("BHU002", "BHU013", 180), ("BHU013", "BHU002", 180),
    ("BHU012", "BHU013", 210), ("BHU013", "BHU012", 210),
    ("BHU011", "BHU002", 200), ("BHU002", "BHU011", 200),

    # West corridor (towards Jaydev Vihar, Vani Vihar)
    ("BHU003", "BHU005", 210), ("BHU005", "BHU003", 210),
    ("BHU005", "BHU019", 300), ("BHU019", "BHU005", 300),

    # South corridor (towards Kalpana, Airport)
    ("BHU016", "BHU017", 180), ("BHU017", "BHU016", 180),
    ("BHU017", "BHU015", 150), ("BHU015", "BHU017", 150),
    ("BHU015", "BHU014", 160), ("BHU014", "BHU015", 160),
    ("BHU014", "BHU006", 200), ("BHU006", "BHU014", 200),
    ("BHU006", "BHU002", 270), ("BHU002", "BHU006", 270),
    ("BHU006", "BHU007", 360), ("BHU007", "BHU006", 360),

    # Cross links
    ("BHU011", "BHU016", 180), ("BHU016", "BHU011", 180),
    ("BHU012", "BHU011", 150), ("BHU011", "BHU012", 150),
    ("BHU018", "BHU003", 330), ("BHU003", "BHU018", 330),
    ("BHU020", "BHU005", 280), ("BHU005", "BHU020", 280),
]


def seed():
    batch = db.batch()

    print("Seeding 20 Bhubaneswar junctions...")
    for j in JUNCTIONS:
        doc = {
            **j,
            "edges": [
                {"to": t, "base_time_sec": w}
                for (f, t, w) in EDGES if f == j["junction_id"]
            ],
            "current_features": None,
            "last_updated": firestore.SERVER_TIMESTAMP,
        }
        ref = db.collection("junctions").document(j["junction_id"])
        batch.set(ref, doc)

    batch.commit()
    print(f"✅ Seeded {len(JUNCTIONS)} junctions in Bhubaneswar")
    print("\nJunction map:")
    for j in JUNCTIONS:
        edge_count = len([e for e in EDGES if e[0] == j["junction_id"]])
        print(f"  {j['junction_id']} — {j['name']:<35} ({edge_count} outgoing edges)")


if __name__ == "__main__":
    seed()
