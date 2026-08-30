# Auditor√≠a de Dimensi√≥n 01: Arquitectura (C4, Modularidad, L√≠mites de Componentes, Acoplamiento)

**Fecha de Auditor√≠a:** 2026-08-30  
**Proyecto:** Cline Marketplace (`cline-marketplace`)  
**Versi√≥n:** 1.0.0  
**Auditor:** Agente Especialista en Arquitectura de Software  
**Entorno de Verificaci√≥n:** Node.js v22.17.0 | Windows 11 x64 (PowerShell)  
**Puntuaci√≥n Global de la Dimensi√≥n:** **7.8 / 10**

---

## 1. Resumen Ejecutivo

La arquitectura de **ClineMarket** ha sido dise√±ada como un **plano de control local (Local Control Plane)** y navegador offline-first para primitivas del ecosistema Cline (Plugins, Skills, Servidores MCP). El sistema adopta una arquitectura desacoplada en tres capas principales:
1. **Capa Cliente (SPA Frontend):** Interfaz de usuario pura construida en Vanilla ES Modules y HTML/CSS sem√°ntico (`public/`), sin dependencias de frameworks de build pesados.
2. **Capa Servidor HTTP / Plano de Control (`server.js` + `lib/`):** Servidor Express 5 configurado para binding en loopback( 127.0.0.1 ), defensa en profundidad (CSP, cabeceras de seguridad, validaci√≥n de inputs, CSRF loopback guard), reconciliaci√≥n de estado contra el sistema de archivos y ejecuci√≥n serializada de subprocessos.
3. **Capa CLI / Runner (`bin/cline-marketplace.js`):** Orquestador de arranque en fr√≠o y distribuci√≥n NPX con descubrimiento din√°mico de puertos, verificaci√≥n de dependencia|“í∆Á¶÷ñVÁFÚWFˆ‹:Fñ6ÚFV¬ÊfVvF˜"‡†¢222&ñÊ6ó∆W2f˜'F∆W¶2'VóFV7L;6Êñ60¢“§w&fÚFRFWVÊFVÊ6ñ2<:÷6∆ñ6ÚFó&ñvñFÚÑDrW7G&ñ7FÚì¢¢¢6W&ÚFWVÊFVÊ6ñ26ó&7V∆&W2V‚FˆFÚV¬&˜ñV7FÚ‡¢“¢§÷˜F˜"FRW'6ó7FVÊ6ñL;6÷ñ66ˆ‚7V&VÁFVÊÜ∆ñ"˜7FFRÊß6ì¢¢¢W67&óGW&2L;6÷ñ626ˆ‚&6Üóf˜2FV◊˜&∆W2í&VÊˆ÷'&FÚÜ&VÊ÷U7ñÊ6í¬6W&ñ∆ó¶6ú;6‚V‚÷V÷˜&ñ˜"'WF6´jòbqçÑÅ‰Å…ïÕ¡Ö±ëºÅÖ’—Ω∑Ö—•çºÅï∏ÅÄπçΩ……’¡–∏Ò—•µïÕ—Öµ¿˘ÄÅï∏ÅçÖÕºÅëîÅ)M=8ÅµÖ±ôΩ…µÖëº∏(¥Ä®©A’ïπ—îÅëîÅM’â¡…ΩçïÕΩÃÅMïù’…ºÅ‰ÅMï…•Ö±•ÈÖëºÄ°Å±•àΩ…’ππï»π©ÕÄ§Ë®®ÅΩ±ÑÅëîÅï©ïç’çßÕ∏ÅA…Ωµ•ÕîµâÖÕïêÅ≈’îÅïŸ•—ÑÅçΩπë•ç•ΩπïÃÅëîÅçÖ……ï…ÑÅçΩπ—…ÑÅ±ÑÅ1$ÅëîÅ±•πî∞ÅçΩ∏Å—•µïΩ’—ÃÅëïôïπÕ•ŸΩÃÅ‰Å—ï…µ•πÖçßÕ∏ÅôΩ…ÈΩÕÑÅëï∞Éç…âΩ∞ÅëîÅ¡…ΩçïÕΩÃÄ°Å—ÖÕ≠≠•±∞ÄΩ¡•êÄΩPÄΩÄÅï∏Å]•πëΩ›Ã§∏(¥Ä®©Õ•ùπÖçßÕ∏Å•ªEµ•çÑÅëîÅA’ï…—ΩÃÄ°ÅÕï…Ÿï»π©ÕÄ§Ë®®ÅA…ïŸïπçßÕ∏ÅëîÅâ±Ω≈’ïΩÃÅÕ§Åï∞Å¡’ï…—ºÅëïôÖ’±–ÅÄ‘ƒ‹ÕÄÅïÕ”ÑÅΩç’¡Öëº∞Å•π—ïπ—ÖπëºÅ¡…Ωù…ïÕ•ŸÖµïπ—îÅ°ÖÕ—ÑÅÅÕ—Ö…—AΩ…–Ä¨Ä»¡Ä∏((åååÅA…•πç•¡Ö±ïÃÅ=¡Ω…—’π•ëÖëïÃÅëîÅ5ï©Ω…Ñ(¥Ä®©5ΩπΩ±•—ºÅï∏ÅÅ±•àΩ…Ω’—ïÃπ©ÕÄÄ°ΩêÅIΩ’—ï»§Ë®®Å∞Å…Ω’—ï»Åçïπ—…Ö∞ÅÖç’µ’±ÑÄ‡ÿƒÅ≥µπïÖÃÅµïÈç±ÖπëºÅïπ…’—Öµ•ïπ—ºÅ·¡…ïÕÃ∞Å≥Õù•çÑÅëîÅπïùΩç•ºÅëîÅçÖ”Ö±Ωùº∞ÅÖù…ïùÖç•ΩπïÃÅïÕ—ÖìµÕ—•çÖÃ∞ÅÖªÖ±•Õ•ÃÅ°ï’ÀµÕ—•çºÅëîÅ¡…ΩÂïç—ΩÃ∞ÅèÖ±ç’±ºÅëîÅç°Öπùï±ΩùÃÅ‰ÅçΩπ—…Ω∞Åëï∞Å¡…ΩçïÕºÅëï∞ÅM<∏(¥Ä®©’¡±•çÖçßÕ∏Å‰Å•Ÿï…ùïπç•ÑÅëîÅ!ï’ÀµÕ—•çÖÃË®®ÅÅ±•àΩ…Ω’—ïÃπ©ÕÄÅ‰ÅÅÕç…•¡—ÃΩëï—ïç–µçΩπ—ï·–πµ©ÕÄÅ•µ¡±ïµïπ—Ö∏ÅµΩ—Ω…ïÃÅëîÅÖªÖ±•Õ•ÃÅëîÅÕ—Öç≠ÃÅë’¡±•çÖëΩÃÅîÅ•πçΩπÕ•Õ—ïπ—ïÃ∏(¥Ä®©Ωâ±îÅïô•π•çßÕ∏ÅëîÅ!ï±¡ï…ÃÅëîÅA±Ö—ÖôΩ…µÑË®®ÅÅ•Õ]•πëΩ›Õ	Ö—ç°M°•µÄÅïÕ”ÑÅë’¡±•çÖëºÅï∏ÅÅ±•àΩÕÖπ•—•Èï…Ãπ©ÕÄÅ‰ÅÅ±•àΩ…ïÕΩ±Ÿï»π©ÕÄÅçΩ∏ÅçΩµ¡Ω…—Öµ•ïπ—ºÅë•Õç…ï¡Öπ—îÅÖπ—îÅÕ•Õ—ïµÖÃÅπºµ]•πëΩ›Ã∏((¥¥¥((ååÄ»∏Å5Ωëï±ºÅ–ËÅ•Öù…ÖµÖÃÅ‰ÅïÕç…•¡çßÕ∏Å¡Ω»ÅÖ¡ÖÃ((åååÅ9•Ÿï∞ÄƒËÅΩπ—ï·—ºÅëï∞ÅM•Õ—ïµÑÄ°MÂÕ—ï¥ÅΩπ—ï·–§()∞ÅÕ•Õ—ïµÑÅΩ¡ï…ÑÅçΩµ¡±ï—Öµïπ—îÅï∏Å±ÑÅ∑Ö≈’•πÑÅ±ΩçÖ∞Åëï∞ÅëïÕÖ……Ω±±ÖëΩ»ÅÕ•∏Å—ï±ïµï—ÀµÑÅπ§Åëï¡ïπëïπç•ÖÃÅëîÅπ’âîÅΩâ±•ùÖ—Ω…•ÖÃÄ°ÕÖ±ŸºÅëïÕçÖ…ùÖÃÅΩ¡ç•ΩπÖ±ïÃÅëîÅçÖ”Ö±ΩùΩÃÅ‰Åµï—ÖëÖ—ΩÃÅëîÅ•—!’à§∏()ÅÅÄ(¨¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥≠)ï¯ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅMII=11=HÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ)ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°9ÖŸïùÖëΩ»Å]ïàÄºÅQï…µ•πÖ∞Å1$ÄºÅMç…•¡—ÃÅëîÅA…ΩÂïç—º§ÄÄÄÄÄÄÄÄÄÄÄÄÅÙ(¨¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¨+êÄÄÄÄÄÄÄÄÄÄÄÄÅÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÄ(ÄÄÄÄÄÄÄÄÄÄÄÄÅÅ!QQ@Ä†ƒ»‹∏¿∏¿∏ƒ§ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÅ1$ÄºÅ9A`(ÄÄÄÄÄÄÄÄÄÄÄÄÅÿÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅŸ}¨¨¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¨)ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ1%9Å5I-QA1Ä°1ΩçÖ∞ÅΩπ—…Ω∞ÅA±Öπî§ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ)ÄÄÄ¥ÅMï…Ÿ•ëΩ»Å·¡…ïÕÃÄ‘Åï∏Å±ΩΩ¡âÖç¨ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ)ÄÄÄ¥ÅIïçΩπç•±•ÖëΩ»ÅëîÅïÕ—ÖëºÅï∏Åë•ÕçºÄ°¯ºπç±•πî∞Å¯ºπç±Ö’ëî∞ÅYLÅΩëîÅçΩπô•ùÃ§ÄÄÄÅ)ÄÄÄ¥Å©ïç’—Ω»ÅÕï…•Ö±•ÈÖëºÅëîÅ1$Äùç±•πîúÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ(¨¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¨(ÄÄÄÄÄÄÄÅÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ(ÄÄÄÄÄÄÄÅÅM’â¡…ΩçïÕÃÄÄÄÄÄÄÄÄÄÅÅM’â¡…ΩçïÕÃÄºÅIMPÄÄÄÄÅÅ•±ïÕÂÕ—ï¥Å%<ÄÄÄÄÅÅ!QQ@ÅIMP(ÄÄÄÄÄÄÄÅÿÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÿÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÿÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÿ(¨¨¥¥¥¥¥¥¥¥¥¥¥¥¨ÄÄÄÄ¨¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¨ÄÄÄÄ¨¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¨ÄÄÄÄ¨¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¨)ÄÄÅ±•πîÅ1$ÄÄÅÄÄÄÅÄÄÄÅ•—!’àÅ1$ÄÄÄÄÅÄÄÄÅÅYLÅΩëîÄºÅ%ÄÄÅÄÄÄÅÄÅ•—!’àÅA$ÄÄÅ)Ä°ç±•πîÄºÄπçµê•ÄÄÄÅÄ°ù†ÅÖ’—†ÄºÅ—Ω≠ï∏§ÅÄÄÄÅÅΩπô•ùÃÄ°5@§ÅÄÄÄÅÄ°Ö—Ö±ΩúΩ5ï—Ñ•(¨¥¥¥¥¥¥¥¥¥¥¥¥¥¨¨ÄÄÄÄ¨¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¨ÄÄÄÄ¨¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¨ÄÄÄÄ¨¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¨)ÅÅÄ((åååÅ9•Ÿï∞Ä»ËÅΩπ—ïπïëΩ…ïÃÄ°Ωπ—Ö•πï»Å•Öù…Ö¥§()ÅÅÅµï…µÖ•ê)ô±Ω›ç°Ö…–ÅQ(ÄÄÄÅÕ’âù…Ö¡†Å±•ïπ—Ωπ—Ö•πï»Ålàƒ∏Å…Ωπ—ïπêÅ]ïàÅMAÄ°¡’â±•åº§ât(ÄÄÄÄÄÄÄÅU%lâÖ¡¿π©ÃÄ°YÖπ•±±ÑÅLÅ5Ωë’±ïÃ§ât(ÄÄÄÄÄÄÄÅ!Q51lâ•πëï‡π°—µ∞Ä¨ÅÕ—Â±ïÃπçÕÃât(ÄÄÄÅïπê((ÄÄÄÅÕ’âù…Ö¡†ÅMï…Ÿï…Ωπ—Ö•πï»Ålà»∏Å·¡…ïÕÃÄ‘Å	Öç≠ïπêÄ°Õï…Ÿï»π©ÃÄ¨Å±•àº§ât(ÄÄÄÄÄÄÄÅMï…Ÿï…	ΩΩ—lâÕï…Ÿï»π©ÃÄ°	ΩΩ—Õ—…Ö¿ÄòÅAΩ…–Å•πëï»§ât(ÄÄÄÄÄÄÄÅIΩ’—ï…E∞âÒ•àΩ…Ω’—ïÃπ©ÃÄ°A$ÅIΩ’—ï»ÄòÅ!Öπë±ï…Ã§ât(ÄÄÄÄÄÄÄÅI’ππï…E∞âÒ•àΩ…’ππï»π©ÃÄ°M’â¡…ΩçïÕÃÅ	…•ëùî§ât(ÄÄÄÄÄÄÄÅM—Ö—ïπù•πïlâ±•àΩÕ—Ö—îπ©ÃÄ°—Ωµ•åÅ)M=8ÅM—Ω…î§ât(ÄÄÄÄÄÄÄÅMA…Ωâïlâ±•àΩ¡…ΩâïÃπ©ÃÄ°•±ïÕÂÕ—ï¥ÅMçÖππï»§ât(ÄÄÄÄÄÄÄÅIïçΩπç•±ï…lâ±•àΩ…ïçΩπç•±ï»π©ÃÄ°…•ô–Åπù•πî§ât(ÄÄÄÄÄÄÄÅIïÕΩ±Ÿï…lâ±•àΩ…ïÕΩ±Ÿï»π©ÃÄ°	•πÖ…‰Å1ΩçÖ—Ω»§ât(ÄÄÄÄÄÄÄÅMÖπ•—•Èï…Õlâ±•àΩÕÖπ•—•Èï…Ãπ©ÃÄ°%π¡’–Å’Ö…ëÃ§ât(ÄÄÄÄÄÄÄÅ1Ωùùï…lâ±•àΩ±Ωùùï»π©ÃÄ°9M$ÅM—…’ç—’…ïêÅ1ΩùÃ§ât(ÄÄÄÅïπê((ÄÄÄÅÕ’âù…Ö¡†Å1%Ωπ—Ö•πï»ÅlàÃ∏Å1$ÅI’ππï»Ä°â•∏Ωç±•πîµµÖ…≠ï—¡±Öçîπ©Ã§ât(ÄÄÄÄÄÄÄÅ±•1Ö’πç°ï…lâ9A`ÄºÅ1$Åπ—…Â¡Ω•π–ÄòÅï¡ïπëïπç‰Å	ΩΩ—Õ—…Ö¡¡ï»ât(ÄÄÄÅïπê((ÄÄÄÅÕ’âù…Ö¡†ÅM—Ω…ÖùïΩπ—Ö•πï»Ålà–∏Å1ΩçÖ∞ÅÖ—ÑÅM—Ω…ÖùîÄ°ëÖ—ÑºÄòÅçÖ—Ö±Ωúπ©Õ∏§ât(ÄÄÄÄÄÄÄÅÖ—Ö±Ωù•±ïlâçÖ—Ö±Ωúπ©Õπ¨Ä°Iïù•Õ—…‰ÅÖç°î§ât(ÄÄÄÄÄÄÄÅ%πÕ—Ö±±ïë•±ïlâëÖ—ÑΩ•πÕ—Ö±±ïêπ©ÕΩ∏Ä°Q…Öç≠ïîÅA…•µ•—•ŸïÃ§ât(ÄÄÄÄÄÄÄÅ]Ö—ç°±•Õ—•±ïlâëÖ—ÑΩ›Ö—ç°±•Õ–π©ÕΩ∏Ä°ÖŸΩ…•—ïÃ§ât(ÄÄÄÄÄÄÄÅ5ï—Ö•±ïlâëÖ—ÑΩ’¡Õ—…ïÖ¥µµï—Ñπ©ÕΩ∏Ä°Ωµµ•–Å5ï—ÖëÖ—Ñ§ât(ÄÄÄÄÄÄÄÅMï——•πùÕ•±ïlâëÖ—ÑΩ’Õï»µÕï——•πùÃπ©ÕΩ∏Ä°A…ïôï…ïπçïÃ§ât(ÄÄÄÅïπê((ÄÄÄÅÕ’âù…Ö¡†Å!ΩÕ—πÿÅlà‘∏Å!ΩÕ–ÅπŸ•…Ωπµïπ–ÄòÅ·—ï…πÖ∞Å	•πÖ…•ïÃât(ÄÄÄÄÄÄÄÅ±•πï·ïlâç±•πîÄºÅç±•πîπçµêât(ÄÄÄÄÄÄÄÅ°·ïlâù†πï·îÄºÅù†ât(ÄÄÄÄÄÄÄÅ•—·ïlâù•–ât(ÄÄÄÄÄÄÄÅM—Ω…ÖùïIΩΩ—Õlâ¯ºπç±•πîº∞Å¯ºπç±Ö’ëîº∞ÅYLÅΩëîÅ±ΩâÖ∞ÅM—Ω…Öùîât(ÄÄÄÅïπê((ÄÄÄÅU$Ä¥¥˘Ò!QQ@Å)M=8ÄΩÖ¡§º©ÒIΩ’—ï»(ÄÄÄÅ±•1Ö’πç°ï»Ä¥¥˘ÒM¡Ö›∏ÅM’â¡…ΩçïÕÕÒMï…Ÿï…	ΩΩ–(ÄÄÄÅMï…Ÿï…	ΩΩ–Ä¥¥¯ÅIΩ’—ï»(ÄÄÄÅIΩ’—ï»Ä¥¥¯ÅMÖπ•—•Èï…Ã(ÄÄÄÅIΩ’—ï»Ä¥¥¯ÅM—Ö—ïπù•πî(ÄÄÄÅIΩ’—ï»Ä¥¥¯ÅMA…Ωâî(ÄÄÄÅIΩ’—ï»Ä¥¥¯ÅIïçΩπç•±ï»(ÄÄÄÅIΩ’—ï»Ä¥¥¯ÅI’ππï»(ÄÄÄÅIΩ’—ï»Ä¥¥¯ÅIïÕΩ±Ÿï»(ÄÄÄÅIΩ’—ï»Ä¥¥¯Å1Ωùùï»((ÄÄÄÅM—Ö—ïπù•πîÄ¥¥¯ÅM—Ω…ÖùïΩπ—Ö•πï»(ÄÄÄÅMA…ΩâîÄ¥¥¯ÅM—Ω…ÖùïIΩΩ—Ã(ÄÄÄÅI’ππï»Ä¥¥¯ÅIïÕΩ±Ÿï»(ÄÄÄÅI’ππï»Ä¥¥¯Å±•πï·î(ÄÄÄÅIΩ’—ï»Ä¥¥¯Å°·î(ÄÄÄÅIΩ’—ï»Ä¥¥¯Å•—·î)ÅÅÄ(
### Nivel 3: Componentes (Component Architecture)

| Componente | Archivo | Responsabilidad Principal | Acoplamiento Directo Con |
| :--- | :--- | :--- | :--- |
| **Server Bootstrap** | `server.js` | Inicializaci√≥n Express 5, port scanning din√°mico (`checkPortAvailable`), middleware de seguridad (CSP, CSRF loopback guard, headers), error handler global. | `lib/logger.js`, `lib/routes.js`, Express |
| **API Router** | `lib/routes.js` | 18+ endpoints REST (`/catalog`, `/installed`, `/install`, `/uninstall`, `/health`, `/stats`, etc.). Enriquecimiento de cat√°logo, changelog diffing. | `lib/state.js`, `lib/sanitizers.js`, `lib/probes.js`, `lib/reconciler.js`, `lib/runner.js`, `lib/resolver.js`, `lib/logger.js` |
| **Subprocess Runner** | `lib/runner.js` | Ejecuci√≥n concurrente serializada (`_commandLock`), mapping de verbos (`verbFor`), timeouts defensivos y terminaci√≥n de √°rbol de procesos (`taskkill`). | `lib/resolver.js`, `lib/sanitizers.js`, `lib/logger.js` |
| **Binary Resolver** | `lib/resolver.js` | Resoluci√≥n de binarios multiplataforma (`where.exe` en Win32, `which` en POSIX, fallback a rutas est√°ndar npm/cargo/homebrew/scoop/choco). | `node:child_process`, `node:fs`, `node:os` |
| **Filesystem Prober** | `lib/probes.js` | Escaneo de ra√≠ces (`.cline`, `.claude`, `.cursor`, VS Code globalStorage, Roo-Cline), extracci√≥n de metadatos de packages locales con cach√© `mtime`. | `lib/state.js`, `node:fs`, `node:os` |
| **State Reconciler** | `lib/reconciler.js` | Funci√≥n pura de reconciliaci√≥n entre estado guardado y estado real en disco (detecci√≥n de drift / eliminaci√≥n externa). | Ninguna dependencia externa (Funci√≥n pura) |
| **State Persistence** | `lib/state.js` | Lectura segura con tolerancia a fallos (`readJson`), escritura at√≥mica con archivo temporal + rename (`safeWriteJson`), cola de escritura por archivo. | `lib/logger.js`, `node:fs`, `node:path` |
| **Sanitizers & Guards** | `lib/sanitizers.js` | Validaci√≥n contra path traversal (`sanitizePrimitiveId`), normalizaci√≥n de tipo (`sanitizePrimitiveType`), validaci√≥n de directorios reales (`sanitizeWorkspacePath`). | `node:fs`, `node:path` |
| **Structured Logger** | `lib/logger.js` | Logging formateado con timestamps, medici√≥n de latencias HTTP y comandos EXEC, soporte de variable `NO_COLOR`. | `node:process` |

---

## 3. Matriz de Import/Export y An√°lisis del Grafo de Dependencias

### Grafo de M√≥dulos (DAG)

```[server.js]
  ‚îî‚îí> [lib/logger.js]
  ‚îî‚îê> [lib/routes.js]
         ‚îú‚îê> [lib/state.js] ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ> [lib/logger.js]
         ‚îú‚íê> [lib/sanitizers.js]
         ‚îú‚îê> [lib/probes.js] ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ> [lib/state.js] ‚îÄ‚îÄ> [lib/logger.js]
         ‚îú‚íê> [lib/reconciler.js]
         ‚îú‚îê> [lib/runner.js]
         ‚í      ‚îú‚îê> [lib/resolver.js]
         ‚îà      ‚îú‚íê> [lib/sanitizers.js]
         ‚í      ‚îî‚îê> [lib/logger.js]
         ‚îú‚îê> [lib/resolver.js]
         ‚îî‚íê> [lib/logger.js]

[bin/cline-marketplace.js] (Standalone Process Wrapper)
  ‚îî‚îí> Spawns [server.js] via node child_process 

### Tabla Completa de Dependencias entre M√≥dulos

| M√≥dulo Origen | Dependencias de `lib/` | Dependencias Externas / Node | Estado de Ciclo |
| :--- | :--- | :--- | :--- |
| `server.js` | `logger.js`, `routes.js` | `express`, `node:fs`, `node:path`, `node:url`, `node:net` | **Ac√©clico (OK)** |
| `lib/routes.js` | `state.js`, `sanitizers.js`, `probes.js`, `reconciler.js`, `runner.js`, `resolver.js`, `logger.js` | `express`, `node:path`, `node:os`, `node:child_process`, `node:util`, `node:fs` | **Ac√≠clico (OK)** |
| `lib/runner.js` | `resolver.js`, `sanitizers.js`, `logger.js` | `node:child_process`, `node:fs`, `node:os` | **Ac√≠clico (OK)** |
| `lib/probes.js` | `state.js` | `node:fs`, `node:path`, `node:os` | **Ac√≠clico (OK)** |
| `lib/state.js` | `logger.js` | `node:fs`, `node:path` | **Ac√©clico (OK)** |
| `lib/reconciler.js`| *(Ninguna)* | *(Ninguna)* | **Ac√©clico (OK - Funci√≥n pura)** |
| `lib/resolver.js` | *(Ninguna)* | `node:child_process`, `node:fs`, `node:path`, `node:os`, `node:util` | **Ac√©clico (OK)** |
| `lib/sanitizers.js`| *(Ninguna)* | `node:fs`, `node:path` | **Ac√≠clico (OK)** |
| `lib/logger.js` | *(Ninguna)* | *(Ninguna)* | **Ac√≠clico (OK)** |
| `bin/cline-marketplace.js` | *(Ninguna - Spawns server.js)* | `node:child_process`, `node:fs`, `node:path`, `node:url`, `node:util`, `node:os`, `node:net` | **Ac√≠clico (OK)** |

**Resultado del An√°lisis de Ciclos:** **0 dependencias circulares detectadas.** El grafo de dependencias es un DAG estricto y bien estratificado hacia la base (`logger.js`, `resolver.js`, `sanitizers.js`, `reconciler.js`).

---

## 4. Cat√°logo Detallado de Hallazgos Arquitect√≥nicos

### [ARQ-01] [Severidad: Alta] Monolito en `lib/routes.js` (God Router) con Acoplamiento Multidominio
- **Ubicaci√≥n:** `lib/routes.js:1-861`
- **Componente Afectado:** API Router / Transport Layer
- **Descripci√≥n:** `lib/routes.js` tiene 861 l√≠neas y act√∫a como un "God Component". Agrupa en un solo archivo:
  1. Enrutamiento y serializaci√≥n HTTP (Express).
  2. Enriquecimiento de catalogo y agregaci√≥n de tags (`lib/routes.js:117-222`).
  3. L√≥gica heur√≠stica de detecci√≥n de stack (`analyzeWorkspaceContext`, l√≠neas 56-114).
  4. L√≥gica de reconciliaci√≥n y dirty-checking de disco (`lib/routes.js:233-250`).
  5. Diagn√≥stico de salud y ejecuci√≥n de binarios `node`, `cline`, `gh` (`lib/routes.js:320-397`).
  6. Orquestaci√≥n de comandos CLI con retry de `--force` (`lib/routes.js:400-470`).
  7. L√≥gica de diffing de cat√°logo para changelog (`lib/routes.js:783-800`).
  8. Consulta a API externa de GitHub para updates y ejecuci√≥n de `git pull` / `npm install` (`lib/routes.js:688-720`).
  9. Control de terminaci√≥n del proceso (`lib/routes.js:854-857`).
- **Impacto:** Viola el Principio de Responsabilidad √önica (SRP). Dificulta el testing unitario de la l√≥gica de negocio aislada del transporte HTTP y genera alta complejidad de mantenimiento.
- **Evidencia Emp√©rica:**
  ```powershell
  # Comando de verificaci√≥n:
  pwsh -Command "(Get-Content lib/routes.js | Measure-Object -Line).Lines; (Get-Item lib/routes.js).Length"
  # Output:
  # 861
  # 31956
  ```
- **Soluci√≥n Propuesta:**
  Refactorizar `lib/routes.js` descomponiendo la l√≥gica en controladores y servicios especializados:
  ```
  lib/
  ‚Äîú‚îê controllers/
  ‚îÇ   ‚îó
### [ARQ-05] [Severidad: Media] Omisi√≥n de Descubrimiento de Primitivas Locales de Tooling (`~/.commandcode`)
- **Ubicaci√≥n:** `lib/probes.js:24-61` (`clineRootCandidates`) y `lib/probes.js:225-271` (`fsProbe`)
- **Componente Afectado:** Filesystem Probing Engine
- **Descripci√≥n:** `lib/probes.js` incluye reglas para escanear `~/.cline`, `~/.claude`, `~/.cursor` y almacenamiento global de VS Code. Sin embargo, en el entorno de desarrollo local existe el directorio activo `C:\Users\mateo\.commandcode` que almacena `skills/` y configuraciones `mcp.json` que no son inspeccionadas.
- **Impacto:** Primitivas locales y servidores MCP configurados en `~/.commandcode` quedan invisibles en el cat√°logo local y en la reconciliaci√≥n de estado.
- **Evidencia Emp√©rica:**
  ```powershell
  # Comando de verificaci√≥n:
  pwsh -Command "Test-Path 'C:\Users\mateo\.commandcode\mcp.json', 'C:\Users\mateo\.commandcode\skills'"
  # Output:
  # True
  # True
  ```
- **Soluci√≥n Propuesta:**
  Incorporar `join(homedir(), ".commandcode")` en `clineRootCandidates()` y `join(homedir(), ".commandcode", "mcp.json")` en la lista de archivos de configuraci√≥n MCP en `lib/probes.js`.
- **Estimaci√≥n de Esfuerzo:** Bajo (30 minutos).

---

### [ARQ-06] [Severidad: Media] Aislamiento de Concurrencia Limitado a Nivel de Proceso √önico
- **Ubicaci√≥n:** `lib/state.js:8, 50-65` y `lib/runner.js:14, 132-134`
- **Componente Afectado:** State Storage & Concurrency Control
- **Descripci√≥n:** La serializaci√≥n de escrituras en `lib/state.js` se implementa mediante `_writeQueues = new Map()` (cadenas de Promises indexadas por ruta can√≥nica), y la serializaci√≥n de comandos `cline` mediante `_commandLock = Promise.resolve()`.
- **Impacto:** Esta protecci√≥n es efectiva mientras exista una √∫nica instancia de Node.js ejecut√°ndose. Sin embargo, si un desarrollador ejecuta comandos CLI (`cline-marketplace refresh` o scripts de sincronizaci√≥n) al mismo tiempo que el servidor `server.js` est√° recibiendo mutaciones (`/api/install`, `/ipi/watchlist`), los dos procesos de Node.js no comparten memoria y pueden competir por los mismos archivos JSON (`catalog.json`, `data/installed.json`). Aunque el renombrado at√≥mico (`renameSync`) evita archivos truncados, no previene "lost updates" (sobreescritura del √∫ltimo cambio).
- **Evidencia Emp√©rica:** Inspecci√≥n de `lib/state.js:8`: `const _writeQueues = new Map();` no cuenta con bloqueo de archivos a nivel de sistema operativo.
- **Soluci√≥n Propuesta:**
  Implementar un mecanismo ligero de file lock basado en `fs.openSync(lockPath, "wx")` o coordinar las operaciones de refresco y escritura a trav√©s de la API REST del servidor cuando est√© activo en lugar de ejecutar scripts independientes en paralelo.
- **Estimaci√≥n de Esfuerzo:** Medio (3 horas).

---

### [AR-07] [Severidad: Baja] M√≥dulo Re-exportador Hu√©rfano `scripts/lib/resolve-command.mjs`
- **Ubicaci√≥n:** `scripts/lib/resolve-command.mjs:1-3`
- **Componente Afectado:** Script Utilities / Modularity
- **Descripci√≥n:** El archivo `scripts/lib/resolve-command.mjs` contiene exclusivamente:
  ```javascript
  // Re-export from canonical lib/resolver.js
  export * from "../../lib/resolver.js";
  ```
  Ningun archivo en el repositorio importa este m√≥dulo (todos importan directamente de `../lib/resolver.js`).
- **Impacto:** C√≥digo muerto y redundancia estructural que confunde la jerarqu√≠a de dependencias.
- **Evidencia Empirica:**
  ```powershell
  # Comando de verificaci√≥n:
  pwsh -Command "Select-String -Path 'scripts/*.mjs', 'lib/*.js' -Pattern 'resolve-command'"
  # Output: (vac√≠o / sin coincidencias de import)
  ```
- **Soluci√≥n Propuesta:** Eliminar el archivo o actualizar los scripts para usarlo si se desea encapsular las rutas relativas.
- **Estimaci√≥n de Esfuerzo:** Bajo (5 minutos).

---

### [ARQ-08] [Severidad: Baja] Duplicaci√≥n de L√≥gica de Logging en Runner CLI
- **Ubicaci√≥n:** `bin/cline-marketplace.js:22-48` vs `lib/logger.js:1-48`
- **Componente Afectado:** CLI Layer / Logging
- **Descripci√≥n:** `bin/cline-marketplace.js` define su propia paleta de colores ANSI y funciones de formateo `log()`, `warn()`, `error()`, omitiendo el respeto por la variable de entorno est√°ndar `NO_COLOR` que s√≠ est√° implementada en `lib/logger.js`.
- **Impacto:** Inconsistencia de formato en terminales no interactivas o entornos de CI sin soporte de color.
- **Evidencia Emp√©rica:** Comparaci√≥n de `bin/cline-marketplace.js:22-32` con `lib/logger.js:3-18`.
- **Soluci√≥n Propuesta:** Reutilizar `lib/logger.js` en `bin/cline-marketplace.js` para unificar el comportamiento de logging en todo el ciclo de vida.
- **Estimaci√≥n de Esfuerzo:** Bajo (20 minutos).

---

## 5. R√∫brica de Evaluaci√≥n y Justificaci√≥n de Puntuaci√≥n

| Criterio | Peso | Puntuaci√≥n | Justificaci√≥n Objetiva |
| :--- | :---: | :---: | :--- |
| **Modelo C4 & Claridad Estructural** | 20% | **8.5 / 10** | Clara definici√≥n de capas (Web SPA, Express Control Plane, CLI Runner, Storage). Contenedores y componentes bien identificados con flujos de datos un√≠vocos. |
| **Grafo de Dependencias & Acoplamiento** | 20% | **8.0 / 10** | Cero dependencias circulares (DAG estricto). Los m√≥dulos base (`state`, `resolver`, `sanitizers`, `reconciler`) son altamente desacoplados. Penalizado por el acoplamiento multidominio en `lib/routes.js`. |
| **Cohesi√≥n & Principio de Responsabilidad √önica** | 20% | **6.5 / 10** | Alta cohesi√≥n en m√≥dulos de soporte (`resolver.js`, `runner.js`, `state.js`, `reconciler.js`). Sin embargo, `lib/routes.js` (861 l√≠neas) concentra demasiadas responsabilidades dispares (God Object). |
| **Robustez, Concurrencia & Persistencia** | 20% | **8.0 / 10** | Excelente manejo de escrituras at√≥micas con cuarentena autom√°tica (`state.js`) y serializaci√≥n de subprocesos (`runner.js`). Limitado a concurrencia mono-proceso en memoria. |
| **Portabilidad & L√≠mites de Plataforma** | 20% | **8.0 / 10** | Excelente soporte multiplataforma Windows/macOS/Linux con resoluci√≥n de shims (`.cmd`, `.bat`, `where.exe`/`which`). Peque√±a inconsistencia en duplicaci√≥n de `isWindowsBatchShim`. |
| **PUNTUACI√ìN TOTAL PONDERADA** | **100%** | **7.8 / 10** | **Arquitectura S√≥lida, Funcional y Lista para Producci√≥n, con deuda t√©cnica concentrada en la modularizaci√≥n de la capa de rutas.** |

---

## 6. Hoja de Ruta de Refactorizaci√≥n Arquitect√≥nica

1. **Fase 1 (Quick Wins - Inmediato / < 2 horas):**
   - Eliminar `isWindowsBatchShim` de `lib/sanitizers.js` y consolidar en `lib/resolver.js` ([ARQ-03]).
   - Eliminar m√≥dulo hu√©rfano `scripts/lib/resolve-command.mjs` ([ARQ-07]).
   - A√±adir `~/.commandcode` al descubrimiento en `lib/probes.js` ([AR-05]).
2. **Fase 2 (Desacoplamiento de Heur√≠sticas - Corto Plazo / 1 d√≠a):**
   - Crear `lib/context.js` unificando la heur√≠stica de stack entre la API REST y los scripts CLI ([ARQ-02]).
   - Reutilizar `lib/logger.js` en `bin/cline-marketplace.js` ([ARQ-08]).
   - Desacoplar `process.exit()` de `lib/routes.js` hacia eventos de ciclo de vida en `server.js` ([AR-04]).
3. **Fase 3 (Modularizaci√≥n de Controladores - Medio Plazo / 2 d√≠as):**
   - Descomponer el God Router `lib/routes.js` (861 l√≠neas) en controladores y servicios tem√°ticos (`catalogService`, `healthService`, `updateService`) ([ARQ-01]).
   - Evaluar file locks a nivel de OS para sincronizaci√≥n inter-proceso segura ([ARQ-06]).
