# img_backend_ebookrequest_docker

[![Docker Image Size](https://badgen.net/docker/size/zlimteck/ebookrequest-backend?icon=docker&label=image%20size)](https://hub.docker.com/r/zlimteck/ebookrequest-backend/)
[![Docker Pulls](https://badgen.net/docker/pulls/zlimteck/ebookrequest-backend?icon=docker&label=pulls)](https://hub.docker.com/r/zlimteck/ebookrequest-backend/)
[![Docker Stars](https://badgen.net/docker/stars/zlimteck/ebookrequest-backend?icon=docker&label=stars)](https://hub.docker.com/r/zlimteck/ebookrequest-backend/)

![image](https://zupimages.net/up/25/20/wdmb.png)

Backend server for EbookRequest web app

## 🐳 Docker Compose:
```bash
services:
  backend:
    image: zlimteck/ebookrequest-backend:latest
    ports:
      - "5001:5001"
    restart: always
    environment:
      - MONGODB_URI=YOUR_URI
      - PORT=5001
      - JWT_SECRET=YOUR_JWT_SECRET
      - REACT_APP_API_URL=YOUR_API_URL_OR_IP:PORT_BACKEND
      - GOOGLE_BOOKS_API_KEY=YOUR_API_KEY
      - ALLOWED_ORIGINS=YOUR_URL_OR_IP:PORT_FRONTEND,YOUR_URL_OR_IP:PORT_BACKEND
      - SMTP_HOST=YOUR_SMTP_HOST
      - SMTP_PORT=YOUR_SMTP_PORT
      - SMTP_SECURE=true #or false
      - SMTP_USER=YOUR_SMTP_USER
      - SMTP_PASSWORD=YOUR_SMTP_PASSWORD
      - EMAIL_FROM_ADDRESS=YOUR_ADRESS_EMAIL
      - EMAIL_FROM_NAME=EbookRequest
      - FRONTEND_URL=YOUR_FRONTEND_URL_OR_IP:PORT_FRONTEND
      - NODE_ENV=production
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```


## Create admin account: 
```bash 
docker exec -it [NOM_OU_ID_DU_CONTENEUR_BACKEND] npm run init-admin
```
