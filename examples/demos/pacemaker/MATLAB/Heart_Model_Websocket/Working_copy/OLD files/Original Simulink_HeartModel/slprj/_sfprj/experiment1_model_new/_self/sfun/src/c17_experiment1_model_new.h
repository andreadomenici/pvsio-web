#ifndef __c17_experiment1_model_new_h__
#define __c17_experiment1_model_new_h__

/* Include files */
#include "sfc_sf.h"
#include "sfc_mex.h"
#include "rtwtypes.h"

/* Type Definitions */
typedef struct {
  uint32_T c17_event1EventCounter;
  uint32_T c17_event2EventCounter;
  uint32_T c17_event3EventCounter;
  int32_T c17_sfEvent;
  uint8_T c17_tp_state;
  boolean_T c17_isStable;
  uint8_T c17_is_active_c17_experiment1_model_new;
  uint8_T c17_is_c17_experiment1_model_new;
  SimStruct *S;
  ChartInfoStruct chartInfo;
  uint32_T chartNumber;
  uint32_T instanceNumber;
  uint8_T c17_doSetSimStateSideEffects;
  const mxArray *c17_setSimStateSideEffectsInfo;
} SFc17_experiment1_model_newInstanceStruct;

/* Named Constants */

/* Variable Declarations */

/* Variable Definitions */

/* Function Declarations */
extern const mxArray
  *sf_c17_experiment1_model_new_get_eml_resolved_functions_info(void);

/* Function Definitions */
extern void sf_c17_experiment1_model_new_get_check_sum(mxArray *plhs[]);
extern void c17_experiment1_model_new_method_dispatcher(SimStruct *S, int_T
  method, void *data);

#endif