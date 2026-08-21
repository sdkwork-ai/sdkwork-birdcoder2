{{- define "sdkwork-birdcoder2.fullname" -}}
{{- printf "%s-%s" .Release.Name "app" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
