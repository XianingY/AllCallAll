package auth

import (
	"errors"

	"github.com/gin-gonic/gin"
)

const (
	ginUserKey = "authenticated_user"
)

// SetClaimsToContext 把认证信息写入上下文
// SetClaimsToContext stores claims into gin context.
func SetClaimsToContext(ctx *gin.Context, claims *Claims) {
	ctx.Set(ginUserKey, claims)
}

// GetClaimsFromContext 从上下文获取认证信息
// GetClaimsFromContext retrieves claims previously stored by middleware.
func GetClaimsFromContext(ctx *gin.Context) (*Claims, error) {
	v, exists := ctx.Get(ginUserKey)
	if !exists {
		return nil, errors.New("no auth claims in context")
	}
	claims, ok := v.(*Claims)
	if !ok {
		return nil, errors.New("invalid auth claims type")
	}
	return claims, nil
}
