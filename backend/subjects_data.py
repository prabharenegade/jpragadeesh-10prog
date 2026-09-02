"""Full syllabus catalog stored in the backend."""

SUBJECT_CATALOG = {
    "Computer Science & IT": [
        "Data Structures", "Algorithms", "Operating Systems", "DBMS",
        "Computer Networks", "AI & Machine Learning", "Cyber Security",
        "Cloud Computing", "Web Development", "Mobile Development",
        "Software Engineering", "Computer Architecture", "Compiler Design",
        "Distributed Systems", "Blockchain", "IoT", "Data Science",
    ],
    "Engineering": [
        "Engineering Mathematics", "Physics", "Chemistry", "Electronics",
        "Electrical Engineering", "Mechanical Engineering", "Civil Engineering",
        "Robotics", "Control Systems", "Thermodynamics", "Fluid Mechanics",
        "Engineering Drawing",
    ],
    "Business": [
        "Marketing", "Finance", "Accounting", "Economics", "Business Analytics",
        "Entrepreneurship", "HR", "Operations", "Supply Chain", "Business Strategy",
    ],
    "Science": [
        "Physics", "Chemistry", "Biology", "Mathematics", "Statistics",
        "Astronomy", "Environmental Science", "Biotechnology", "Genetics",
        "Microbiology", "Geology",
    ],
    "Humanities": [
        "Psychology", "Sociology", "Philosophy", "History", "Political Science",
        "Geography", "Anthropology", "Literature", "Linguistics", "Economics",
    ],
    "Medical & Health": [
        "Anatomy", "Physiology", "Pharmacology", "Biochemistry", "Microbiology",
        "Pathology", "Public Health", "Nutrition",
    ],
    "Law": [
        "Constitutional Law", "Criminal Law", "Corporate Law", "International Law",
        "Intellectual Property", "Cyber Law",
    ],
    "Arts & Design": [
        "Graphic Design", "UI/UX", "Animation", "Photography", "Digital Art",
        "Architecture", "Film Studies",
    ],
    "Emerging Technology": [
        "Generative AI", "LLMs", "Quantum Computing", "AR/VR",
        "Autonomous Systems", "Space Technology", "Robotics", "Green Technology",
    ],
    "Mathematics Deep": [
        "Integration", "Differentiation", "Logic & Truth Tables", "Algebra",
        "Linear Algebra", "Calculus", "Probability", "Discrete Mathematics",
    ],
}

# Flat list of all subjects for quick matching
ALL_SUBJECTS = sorted({s for lst in SUBJECT_CATALOG.values() for s in lst})

LANGUAGES = [
    {"code": "en", "label": "English"},
    {"code": "ta", "label": "Tamil"},
    {"code": "tanglish", "label": "Tanglish"},
    {"code": "hi", "label": "Hindi"},
    {"code": "te", "label": "Telugu"},
    {"code": "kn", "label": "Kannada"},
    {"code": "ml", "label": "Malayalam"},
]

TEACHERS = [
    {
        "id": "kalam",
        "name": "Dr. A. Mentor",
        "style": "Inspiring visionary mentor. Warm, encouraging, uses real-world analogies and motivational lines.",
        "voice": "onyx",
    },
    {
        "id": "prof",
        "name": "Prof. Ananya",
        "style": "Sharp CS & AI professor. Precise, structured, loves clean code and step-by-step logic.",
        "voice": "nova",
    },
    {
        "id": "tanglish",
        "name": "Karthik Anna",
        "style": "Friendly Tanglish math buddy. Mixes Tamil + English casually, super relatable and fun.",
        "voice": "echo",
    },
    {
        "id": "socratic",
        "name": "The Socratic Guide",
        "style": "Asks probing questions, guides you to the answer instead of spoon-feeding.",
        "voice": "sage",
    },
]
