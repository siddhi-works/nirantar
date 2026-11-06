CREATE INDEX "registered_workspace_hfr" ON "registered_patients" USING btree ("workspace","hfr_id","created_at");--> statement-breakpoint
CREATE INDEX "registered_workspace_name" ON "registered_patients" USING btree ("workspace","name");--> statement-breakpoint
CREATE INDEX "sim_consents_hiu_abha" ON "sim_consents" USING btree ("workspace","hiu_hfr","abha");