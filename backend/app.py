from flask import Flask, request, jsonify
from flask_cors import CORS
from nltk.tokenize import TreebankWordTokenizer
from nlp import extract_symptoms
from ensemble import predict_diagnosis
from recommendation import get_recommendation
from adaptive_routing import route_next_question
import csv
import os

app = Flask(__name__)
CORS(app)

GENERAL_QUESTIONS = [
    "How have you been feeling lately?",
    "Have you experienced any unusual changes in behavior?",
    "Are there any particular thoughts that worry you often?",
    "Do you feel comfortable in social settings?",
    "Have your sleeping patterns changed recently?",
    "Do you find it hard to concentrate on tasks?",
    "Are there any repetitive thoughts or actions you engage in?",
    "Have you faced difficulties in expressing emotions?",
    "Do loud sounds or bright lights affect you strongly?",
    "Is change in routine distressing for you?"
]

CONFIDENCE_THRESHOLD = 85
MAX_FOLLOWUPS = 5

ARTICLE_LINKS = {
    "Anxiety": [
        "https://www.nimh.nih.gov/health/topics/anxiety-disorders",
        "https://www.helpguide.org/articles/anxiety/anxiety-disorders-and-anxiety-attacks.htm"
    ],
    "OCD": [
        "https://iocdf.org/about-ocd/",
        "https://www.nimh.nih.gov/health/topics/obsessive-compulsive-disorder-ocd"
    ],
    "Autism": [
        "https://www.cdc.gov/ncbddd/autism/index.html",
        "https://www.autismspeaks.org/what-autism"
    ]
}

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    message = data['message']
    index = data.get('question_index', 0)
    followup_count = data.get('followup_count', 0)
    responses = data.get('answers', [])

    all_text = " ".join(responses + [message])
    all_tokens = TreebankWordTokenizer().tokenize(all_text)
    all_symptoms = extract_symptoms(all_tokens)

    if index < len(GENERAL_QUESTIONS):
        return jsonify({
            "reply": None,
            "next_question": GENERAL_QUESTIONS[index],
            "question_index": index + 1,
            "followup_count": 0,
            "answers": responses + [message]
        })

    diagnosis, confidence = predict_diagnosis(all_symptoms)

    # ⛔️ Check for vague response
    if len(all_symptoms) < 3 or message.lower() in ["ok", "i don't know", "maybe", "not sure"]:
        confidence = min(confidence, 60)

    if confidence < CONFIDENCE_THRESHOLD and followup_count < MAX_FOLLOWUPS:
        next_q = route_next_question(all_symptoms, diagnosis, confidence)
        return jsonify({
            "reply": None,
            "next_question": next_q,
            "question_index": index,
            "followup_count": followup_count + 1,
            "answers": responses + [message]
        })

    if confidence < CONFIDENCE_THRESHOLD:
        return jsonify({
            "reply": "The current responses are inconclusive for a confident diagnosis.\nWe recommend seeking professional medical advice.",
            "next_question": None,
            "question_index": 0,
            "followup_count": 0,
            "show_result": True
        })

    save_structured_feedback(responses + [message], diagnosis, confidence)
    advice = get_recommendation(diagnosis)
    articles = ARTICLE_LINKS.get(diagnosis, [])
    reply = f"Likely condition: {diagnosis} ({confidence}%)\nRecommendation: {advice}"

    if articles:
        reply += "\n\n🔗 Helpful Reading:\n" + "\n".join(articles)

    return jsonify({
        "reply": reply,
        "next_question": None,
        "question_index": 0,
        "followup_count": 0,
        "show_result": True
    })

def save_structured_feedback(responses, predicted, confidence):
    folder = "data"
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "feedback.csv")

    padded = responses[:15] + [""] * (15 - len(responses))
    row = padded + [predicted, confidence]
    headers = [f"Q{i+1}" for i in range(10)] + [f"Followup{i+1}" for i in range(5)] + ["Predicted Label", "Confidence (%)"]

    file_exists = os.path.isfile(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(headers)
        writer.writerow(row)

if __name__ == '__main__':
    print("✅ Flask app is starting...")
    app.run(debug=True)
