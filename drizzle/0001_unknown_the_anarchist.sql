CREATE TABLE `admin_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`totpSecret` varchar(64),
	`totpEnabled` boolean NOT NULL DEFAULT false,
	`senhaHash` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admin_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `painel_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`usuarioId` int,
	`usuarioNome` varchar(128),
	`acao` varchar(64) NOT NULL,
	`detalhe` text,
	`ip` varchar(64),
	`userAgent` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `painel_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `painel_usuarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(128) NOT NULL,
	`email` varchar(320),
	`token` varchar(64) NOT NULL,
	`ativo` boolean NOT NULL DEFAULT true,
	`permBuscar` boolean NOT NULL DEFAULT true,
	`permEnriquecimento` boolean NOT NULL DEFAULT true,
	`permAlvara` boolean NOT NULL DEFAULT false,
	`permOficio` boolean NOT NULL DEFAULT false,
	`permIA` boolean NOT NULL DEFAULT true,
	`limiteConsultasDia` int NOT NULL DEFAULT 50,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `painel_usuarios_id` PRIMARY KEY(`id`),
	CONSTRAINT `painel_usuarios_token_unique` UNIQUE(`token`)
);
