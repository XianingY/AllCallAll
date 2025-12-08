package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// JSONError 返回标准错误响应
// JSONError sends a JSON error message with status code.
func JSONError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{
		"error":   message,
		"success": false,
	})
}

// JSONSuccess 返回成功响应
// JSONSuccess sends JSON with optional data.
func JSONSuccess(c *gin.Context, status int, data interface{}) {
	if data == nil {
		data = gin.H{"success": true}
	}
	if status == 0 {
		status = http.StatusOK
	}
	c.JSON(status, data)
}
