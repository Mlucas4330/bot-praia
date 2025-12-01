package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/robfig/cron/v3"
)

type messagePayload struct {
	Number string `json:"number"`
	Text   string `json:"text"`
}

var (
	apiKey  string
	url     string
	groupID string
	client  *resty.Client
)

func init() {
	apiKey = os.Getenv("AUTHENTICATION_API_KEY")
	url = os.Getenv("EVOLUTION_API_URL")
	groupID = os.Getenv("GROUP_ID")

	client = resty.New().
		SetTimeout(15*time.Second).
		SetHeader("Content-Type", "application/json").
		SetHeader("apikey", apiKey)
}

func sendMessage(data *messagePayload) error {
	resp, err := client.R().SetBody(data).Post(url)

	if err != nil {
		return err
	}

	if resp.StatusCode() >= 400 {
		return fmt.Errorf("evolution api error: status %d, body: %s",
			resp.StatusCode(), resp.String(),
		)
	}

	return nil
}

func main() {
	targetDate := time.Date(2026, 1, 5, 0, 0, 0, 0, time.Local)

	task := func() {
		now := time.Now()

		fmt.Printf("Executando tarefa: %s\n", now.Format(time.RFC3339))

		tYear, tMonth, tDay := targetDate.Date()
		nYear, nMonth, nDay := now.Date()

		if tYear == nYear && tMonth == nMonth && tDay == nDay {
			msg := &messagePayload{
				Number: groupID,
				Text:   "É HOJE PORRAAAA VAMOOOO",
			}
			fmt.Println("Hoje é o dia! Enviando mensagem principal...")
			if err := sendMessage(msg); err != nil {
				fmt.Println("Erro ao enviar:", err)
			}
			return
		}

		if now.After(targetDate) {
			fmt.Println("A data alvo já passou.")
			return
		}

		daysLeft := int(targetDate.Truncate(24*time.Hour).Sub(now.Truncate(24*time.Hour)).Hours() / 24)

		fmt.Printf("Enviando contagem regressiva: %d dias\n", daysLeft)

		msg := &messagePayload{
			Number: groupID,
			Text:   fmt.Sprintf("CALMA GALERA... FALTAM APENAS %d DIAS 🎉🔥", daysLeft),
		}

		if err := sendMessage(msg); err != nil {
			log.Println("Erro ao enviar:", err)
		}
	}

	c := cron.New()

	fmt.Println("Iniciando Bot...")

	// rodar todo dia às 13:00
	c.AddFunc("0 13 * * *", task)

	// go task()

	c.Start()
	select {}
}
