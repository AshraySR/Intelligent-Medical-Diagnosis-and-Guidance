import React, { useState, useEffect } from "react";
import axios from "axios";
import "../ChatBot.css";

const ChatBot = ({ formData }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [crfKeywords, setCrfKeywords] = useState([]);
  const [showFollowups, setShowFollowups] = useState(false);
  const [gptIndex, setGptIndex] = useState(0);
  const [gptResponses, setGptResponses] = useState([]);
  const [baseConfidence, setBaseConfidence] = useState(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [advice, setAdvice] = useState("");
  const [awaitingGPT, setAwaitingGPT] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    const startChat = async () => {
      const intro = [
        { sender: "bot", text: "🧠 Welcome to your personal mental health assistant!" },
        { sender: "bot", text: "Let's begin with a few quick questions to understand you better." }
      ];
      setMessages(intro);

      const res = await axios.post(
        "http://localhost:5000/chat",
        {
          message: "",
          question_index: 0,
          followup_count: 0,
          answers: [],
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const { next_question, question_index, crf_keywords } = res.data;
      setMessages((prev) => [...prev, { sender: "bot", text: next_question }]);
      setQuestionIndex(question_index);
      if (crf_keywords) setCrfKeywords(crf_keywords);
    };

    startChat();
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;
    const token = localStorage.getItem("jwt_token");
    const userMessage = { sender: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // If in GPT follow-up mode
    if (showFollowups) {
      try {
        const res = await axios.post(
          "http://localhost:5000/gpt_followup",
          {
            gpt_response: input,
            gpt_responses: gptResponses,
            base_confidence: baseConfidence,
            diagnosis,
            symptoms: crfKeywords,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (res.data.final) {
          setMessages((prev) => [
            ...prev,
            { sender: "bot", text: `✅ Adjusted Confidence Score: ${res.data.updated_confidence}%` },
            { sender: "bot", text: `📌 Recommendation: ${advice}` },
          ]);
          resetState();
        } else {
          setGptResponses(res.data.gpt_responses);
          setMessages((prev) => [...prev, { sender: "bot", text: res.data.next_gpt_question }]);
        }
      } catch (err) {
        setMessages((prev) => [...prev, { sender: "bot", text: "⚠️ GPT follow-up failed." }]);
      }
      return;
    }

    // Else: Normal diagnostic Q&A
    try {
      const res = await axios.post(
        "http://localhost:5000/chat",
        {
          message: input,
          question_index: questionIndex,
          answers: answers,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const {
        reply,
        next_question,
        question_index,
        show_result,
        crf_keywords,
      } = res.data;

      setAnswers((prev) => [...prev, input]);
      if (crf_keywords) setCrfKeywords(crf_keywords);

      if (next_question) {
        setMessages((prev) => [...prev, { sender: "bot", text: next_question }]);
        setQuestionIndex(question_index);
      }

      if (show_result) {
        const predictRes = await axios.post(
          "http://localhost:5000/predict",
          {
            form: formData,
            answers: [...answers, input],
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const { prediction, confidence, advice } = predictRes.data;
        setDiagnosis(prediction);
        setBaseConfidence(confidence);
        setAdvice(advice);

        await axios.post(
          "http://localhost:5000/log_feedback",
          {
            form: formData,
            answers: [...answers, input],
            diagnosis: prediction,
            confidence: confidence,
            symptoms: crfKeywords,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        // Begin GPT follow-ups
        const gptInit = await axios.post(
          "http://localhost:5000/gpt_followup",
          {
            gpt_response: "", // first time
            gpt_responses: [],
            base_confidence: confidence,
            diagnosis: prediction,
            symptoms: crfKeywords,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        setShowFollowups(true);
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: `💡 Initial Diagnosis: ${prediction}` },
          { sender: "bot", text: `🧪 Starting GPT-based follow-ups to fine-tune confidence...` },
          { sender: "bot", text: gptInit.data.next_gpt_question },
        ]);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [...prev, { sender: "bot", text: "Something went wrong. Please try again." }]);
    }
  };

  const resetState = () => {
    setQuestionIndex(0);
    setAnswers([]);
    setCrfKeywords([]);
    setShowFollowups(false);
    setGptIndex(0);
    setGptResponses([]);
    setBaseConfidence(null);
    setDiagnosis("");
    setAdvice("");
  };

  return (
    <div className="chat-container">
      <div className="chat-box">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.sender}`}>{msg.text}</div>
        ))}
      </div>
      <div className="input-box">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type your response..."
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
};

export default ChatBot;
