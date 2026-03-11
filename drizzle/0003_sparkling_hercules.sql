CREATE TABLE `painel_links_short` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigo` varchar(16) NOT NULL,
	`usuarioId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `painel_links_short_id` PRIMARY KEY(`id`),
	CONSTRAINT `painel_links_short_codigo_unique` UNIQUE(`codigo`)
);
